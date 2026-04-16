import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, PlugZap, RefreshCw, RotateCcw, Sparkles, Wrench } from "lucide-react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

import {
  buildDenAuthUrl,
  createDenClient,
  DEFAULT_DEN_BASE_URL,
  readDenSettings,
  writeDenSettings,
  type DenOrgSummary,
  type DenUser,
  type DenWorkerSummary,
} from "../../../app/lib/den";
import type { ScheduledJob } from "../../../app/lib/tauri";
import {
  createOpenworkServerClient,
  type OpenworkAuditEntry,
  type OpenworkCommandItem,
  type OpenworkHubSkillItem,
  type OpenworkMcpItem,
  type OpenworkOpenCodeRouterBindingItem,
  type OpenworkOpenCodeRouterBindingsResult,
  type OpenworkOpenCodeRouterHealthSnapshot,
  type OpenworkPluginItem,
  type OpenworkSkillItem,
} from "../../../app/lib/openwork-server";
import type { UpdateHandle } from "../../../app/types";
import { HIDE_TITLEBAR_PREF_KEY } from "../../../app/constants";
import {
  resetOpenworkState,
  resetOpencodeCache,
  sandboxCleanupOpenworkContainers,
  setWindowDecorations,
  updaterEnvironment,
  type UpdaterEnvironment,
} from "../../../app/lib/tauri";
import {
  applyThemeMode,
  getInitialThemeMode,
  persistThemeMode,
  subscribeToSystemTheme,
  type ThemeMode,
} from "../../../app/theme";
import { currentLocale, setLocale, t, type Language } from "../../../i18n";
import { formatRelativeTime, isTauriRuntime, isWindowsPlatform, safeStringify } from "../../../app/utils";
import { selectActiveWorkspace, selectServerHostLabel, selectWorkspaceScopeLabel, useOpenworkStore } from "../../kernel/store";
import { AppearanceSettings } from "./tabs/appearance";
import { RecoverySettings } from "./tabs/recovery";
import { UpdatesSettings } from "./tabs/updates";
import { CardQuiet, CardShell } from "../../design-system/ui/card";
import { Button } from "../../design-system/ui/button";
import { Input } from "../../design-system/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../design-system/ui/tabs";

type SettingsTab =
  | "general"
  | "advanced"
  | "appearance"
  | "updates"
  | "recovery"
  | "cloud"
  | "skills"
  | "extensions"
  | "automations"
  | "messaging"
  | "debug";

type UpdateStatus =
  | { state: "idle"; lastCheckedAt: number | null }
  | { state: "checking"; startedAt: number }
  | { state: "available"; lastCheckedAt: number; version: string; date?: string; notes?: string }
  | {
      state: "downloading";
      lastCheckedAt: number;
      version: string;
      totalBytes: number | null;
      downloadedBytes: number;
      notes?: string;
    }
  | { state: "ready"; lastCheckedAt: number; version: string; notes?: string }
  | { state: "error"; lastCheckedAt: number | null; message: string };

type PendingUpdate = {
  update: UpdateHandle;
  version: string;
  notes?: string;
} | null;

type ResourceState = {
  skills: OpenworkSkillItem[];
  hubSkills: OpenworkHubSkillItem[];
  plugins: OpenworkPluginItem[];
  mcp: OpenworkMcpItem[];
  commands: OpenworkCommandItem[];
  jobs: ScheduledJob[];
  routerHealth: OpenworkOpenCodeRouterHealthSnapshot | null;
  routerBindings: OpenworkOpenCodeRouterBindingItem[];
  audit: OpenworkAuditEntry[];
};

const EMPTY_RESOURCES: ResourceState = {
  skills: [],
  hubSkills: [],
  plugins: [],
  mcp: [],
  commands: [],
  jobs: [],
  routerHealth: null,
  routerBindings: [],
  audit: [],
};

const TABS: Array<{ id: SettingsTab; label: string; description: string }> = [
  { id: "general", label: "General", description: "Workspace and connection overview" },
  { id: "advanced", label: "Advanced", description: "Runtime diagnostics, capabilities, and engine controls" },
  { id: "appearance", label: "Appearance", description: "Theme, language, and titlebar" },
  { id: "updates", label: "Updates", description: "Desktop updater and restart controls" },
  { id: "recovery", label: "Recovery", description: "Config, cache, and container repair" },
  { id: "cloud", label: "Cloud", description: "Hosted workers, orgs, and remote connect" },
  { id: "skills", label: "Skills", description: "Installed skills and hub install surface" },
  { id: "extensions", label: "Extensions", description: "Plugins, MCP servers, and commands" },
  { id: "automations", label: "Automations", description: "Scheduled jobs and recurring flows" },
  { id: "messaging", label: "Messaging", description: "OpenCode Router health and bindings" },
  { id: "debug", label: "Debug", description: "Audit trail and runtime logs" },
];

const WORKSPACE_TAB_IDS: SettingsTab[] = [
  "general",
  "automations",
  "skills",
  "extensions",
  "messaging",
  "advanced",
];

const GLOBAL_TAB_IDS: SettingsTab[] = [
  "cloud",
  "appearance",
  "updates",
  "recovery",
  "debug",
];

const UPDATE_AUTO_CHECK_KEY = "openwork.updateAutoCheck";
const UPDATE_AUTO_DOWNLOAD_KEY = "openwork.updateAutoDownload";

function readBooleanPreference(key: string, fallback: boolean) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === "1" || raw === "true") return true;
    if (raw === "0" || raw === "false") return false;
  } catch {
    // ignore
  }
  return fallback;
}

function writeBooleanPreference(key: string, value: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // ignore
  }
}

function clearOpenworkLocalStorage() {
  if (typeof window === "undefined") return;
  try {
    const keys = Object.keys(window.localStorage);
    for (const key of keys) {
      if (key.includes("openwork")) {
        window.localStorage.removeItem(key);
      }
    }
    window.localStorage.removeItem("openwork_mode_pref");
  } catch {
    // ignore
  }
}

function isSettingsTab(value: string | null): value is SettingsTab {
  return TABS.some((tab) => tab.id === value);
}

function normalizeSettingsTab(value: string | null): SettingsTab | null {
  if (value === "den") return "cloud";
  return isSettingsTab(value) ? value : null;
}

function capabilitySummary(capability?: {
  read?: boolean;
  write?: boolean;
  source?: string;
}) {
  if (!capability) return "Unavailable";
  const access = [
    capability.read ? "read" : null,
    capability.write ? "write" : null,
  ]
    .filter(Boolean)
    .join(" / ");
  const label = access || "No access";
  return capability.source ? `${label} · ${capability.source}` : label;
}

function DetailCard(props: { label: string; value: string; hint?: string }) {
  return (
    <div className="ow-soft-card-quiet px-4 py-4">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{props.label}</div>
      <div className="mt-2 text-lg font-semibold text-slate-900">{props.value}</div>
      {props.hint ? <div className="mt-2 text-sm leading-6 text-slate-500">{props.hint}</div> : null}
    </div>
  );
}

function EmptyPanel(props: { title: string; body: string }) {
  return (
    <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm leading-7 text-slate-500">
      <div className="font-medium text-slate-900">{props.title}</div>
      <div className="mt-2">{props.body}</div>
    </div>
  );
}

export function SettingsScreen() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const developerMode = Boolean(import.meta.env.DEV);
  const server = useOpenworkStore((state) => state.server);
  const workspaces = useOpenworkStore((state) => state.workspaces);
  const workspacesStatus = useOpenworkStore((state) => state.workspacesStatus);
  const refreshServer = useOpenworkStore((state) => state.refreshServer);
  const connectToServer = useOpenworkStore((state) => state.connectToServer);
  const connectRemoteWorkspace = useOpenworkStore((state) => state.connectRemoteWorkspace);
  const workerProfiles = useOpenworkStore((state) => state.workerProfiles);
  const activeWorkerProfileId = useOpenworkStore((state) => state.activeWorkerProfileId);
  const removeWorkerProfile = useOpenworkStore((state) => state.removeWorkerProfile);
  const activeWorkspace = useOpenworkStore(selectActiveWorkspace);
  const serverHost = useOpenworkStore(selectServerHostLabel);
  const logs = useOpenworkStore((state) => state.logs);
  const sessions = useOpenworkStore((state) => state.sessions);
  const sessionStatusById = useOpenworkStore((state) => state.sessionStatusById);

  const [url, setUrl] = useState(server.url);
  const [token, setToken] = useState(server.token);
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    return normalizeSettingsTab(searchParams.get("tab")) ?? "general";
  });
  const [pluginSpec, setPluginSpec] = useState("");
  const [resources, setResources] = useState<ResourceState>(EMPTY_RESOURCES);
  const [loadingResources, setLoadingResources] = useState(false);
  const [resourceError, setResourceError] = useState<string | null>(null);
  const supportsRouter = server.capabilities?.proxy?.opencodeRouter === true;
  const [remoteHostUrl, setRemoteHostUrl] = useState("");
  const [remoteToken, setRemoteToken] = useState("");
  const [remoteDirectory, setRemoteDirectory] = useState("");
  const [remoteName, setRemoteName] = useState("");
  const [remoteConnectBusy, setRemoteConnectBusy] = useState(false);

  const denSettings = useMemo(() => readDenSettings(), []);
  const [cloudBaseUrl, setCloudBaseUrl] = useState(denSettings.baseUrl || DEFAULT_DEN_BASE_URL);
  const [cloudToken, setCloudToken] = useState(denSettings.authToken?.trim() || "");
  const [cloudUser, setCloudUser] = useState<DenUser | null>(null);
  const [cloudOrgs, setCloudOrgs] = useState<DenOrgSummary[]>([]);
  const [cloudOrgId, setCloudOrgId] = useState(denSettings.activeOrgId?.trim() || "");
  const [cloudWorkers, setCloudWorkers] = useState<DenWorkerSummary[]>([]);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [openingCloudWorkerId, setOpeningCloudWorkerId] = useState<string | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getInitialThemeMode());
  const [language, setLanguageState] = useState<Language>(() => currentLocale());
  const [hideTitlebar, setHideTitlebar] = useState(() =>
    readBooleanPreference(HIDE_TITLEBAR_PREF_KEY, false),
  );
  const [updateAutoCheck, setUpdateAutoCheck] = useState(() =>
    readBooleanPreference(UPDATE_AUTO_CHECK_KEY, true),
  );
  const [updateAutoDownload, setUpdateAutoDownload] = useState(() =>
    readBooleanPreference(UPDATE_AUTO_DOWNLOAD_KEY, false),
  );
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({
    state: "idle",
    lastCheckedAt: null,
  });
  const [pendingUpdate, setPendingUpdate] = useState<PendingUpdate>(null);
  const [updateEnv, setUpdateEnv] = useState<UpdaterEnvironment | null>(null);
  const [revealConfigBusy, setRevealConfigBusy] = useState(false);
  const [resetConfigBusy, setResetConfigBusy] = useState(false);
  const [configActionStatus, setConfigActionStatus] = useState<string | null>(null);
  const [cacheRepairBusy, setCacheRepairBusy] = useState(false);
  const [cacheRepairResult, setCacheRepairResult] = useState<string | null>(null);
  const [dockerCleanupBusy, setDockerCleanupBusy] = useState(false);
  const [dockerCleanupResult, setDockerCleanupResult] = useState<string | null>(null);

  const anyActiveRuns = useMemo(
    () =>
      sessions.some((session) => {
        const status = sessionStatusById[session.id] ?? "idle";
        return status === "running" || status === "retry";
      }),
    [sessionStatusById, sessions],
  );

  const workspaceConfigPath = useMemo(() => {
    const record = activeWorkspace as
      | {
          path?: string | null;
          opencode?: { directory?: string | null } | null;
        }
      | null;
    const root = String(record?.opencode?.directory ?? record?.path ?? "").trim();
    if (!root) return null;
    const normalized = root.replace(/[\\/]+$/, "");
    const separator = isWindowsPlatform() ? "\\" : "/";
    return `${normalized}${separator}.opencode${separator}openwork.json`;
  }, [activeWorkspace]);

  const updateRestartBlockedMessage = anyActiveRuns
    ? t("system.stop_runs_before_update")
    : null;

  const visibleTabs = useMemo(
    () => TABS.filter((tab) => developerMode || tab.id !== "debug"),
    [developerMode],
  );

  const workspaceTabs = useMemo(
    () => visibleTabs.filter((tab) => WORKSPACE_TAB_IDS.includes(tab.id)),
    [visibleTabs],
  );

  const globalTabs = useMemo(
    () => visibleTabs.filter((tab) => GLOBAL_TAB_IDS.includes(tab.id)),
    [visibleTabs],
  );

  const activeTabMeta = useMemo(
    () => visibleTabs.find((tab) => tab.id === activeTab) ?? visibleTabs[0] ?? TABS[0],
    [activeTab, visibleTabs],
  );

  useEffect(() => {
    setUrl(server.url);
    setToken(server.token);
  }, [server.token, server.url]);

  useEffect(() => {
    applyThemeMode(themeMode);
    persistThemeMode(themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (themeMode !== "system") return;
    return subscribeToSystemTheme(() => {
      applyThemeMode("system");
    });
  }, [themeMode]);

  useEffect(() => {
    writeBooleanPreference(HIDE_TITLEBAR_PREF_KEY, hideTitlebar);
  }, [hideTitlebar]);

  useEffect(() => {
    writeBooleanPreference(UPDATE_AUTO_CHECK_KEY, updateAutoCheck);
  }, [updateAutoCheck]);

  useEffect(() => {
    writeBooleanPreference(UPDATE_AUTO_DOWNLOAD_KEY, updateAutoDownload);
  }, [updateAutoDownload]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    updaterEnvironment()
      .then((value) => setUpdateEnv(value))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const requested = normalizeSettingsTab(searchParams.get("tab"));
    if (!requested || (!developerMode && requested === "debug")) {
      if (activeTab !== "general") {
        setActiveTab("general");
      }
      return;
    }
    if (requested !== activeTab) {
      setActiveTab(requested);
    }
  }, [activeTab, developerMode, searchParams]);

  const handleTabChange = useCallback(
    (value: SettingsTab) => {
      setActiveTab(value);
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set("tab", value);
        return next;
      });
    },
    [setSearchParams],
  );

  const workspaceId = activeWorkspace?.id ?? null;
  const serverClient = useMemo(() => {
    const baseUrl = server.url.trim();
    if (!baseUrl) return null;
    return createOpenworkServerClient({
      baseUrl,
      token: server.token.trim() || undefined,
    });
  }, [server.token, server.url]);

  const cloudClient = useMemo(
    () => createDenClient({ baseUrl: cloudBaseUrl, token: cloudToken }),
    [cloudBaseUrl, cloudToken],
  );

  useEffect(() => {
    writeDenSettings({
      baseUrl: cloudBaseUrl,
      authToken: cloudToken || null,
      activeOrgId: cloudOrgId || null,
      activeOrgSlug: denSettings.activeOrgSlug ?? null,
      activeOrgName: denSettings.activeOrgName ?? null,
    });
  }, [cloudBaseUrl, cloudOrgId, cloudToken, denSettings.activeOrgName, denSettings.activeOrgSlug]);

  const refreshCloud = useCallback(async () => {
    if (!cloudToken.trim()) {
      setCloudUser(null);
      setCloudOrgs([]);
      setCloudWorkers([]);
      setCloudError(null);
      return;
    }

    setCloudBusy(true);
    setCloudError(null);
    try {
      const user = await cloudClient.getSession();
      const orgResponse = await cloudClient.listOrgs();
      const orgs = orgResponse.orgs;
      const nextOrgId = orgs.some((org) => org.id === cloudOrgId)
        ? cloudOrgId
        : orgResponse.defaultOrgId ?? orgs[0]?.id ?? "";

      setCloudUser(user);
      setCloudOrgs(orgs);
      setCloudOrgId(nextOrgId);

      if (nextOrgId) {
        const workers = await cloudClient.listWorkers(nextOrgId, 20);
        setCloudWorkers(workers);
      } else {
        setCloudWorkers([]);
      }
    } catch (error) {
      setCloudUser(null);
      setCloudWorkers([]);
      setCloudError(error instanceof Error ? error.message : String(error));
    } finally {
      setCloudBusy(false);
    }
  }, [cloudClient, cloudOrgId, cloudToken]);

  useEffect(() => {
    void refreshCloud();
  }, [refreshCloud]);

  const refreshResources = useCallback(async () => {
    if (!serverClient || !workspaceId) {
      setResources(EMPTY_RESOURCES);
      setResourceError(null);
      return;
    }

    setLoadingResources(true);
    setResourceError(null);

    const results = await Promise.allSettled([
      serverClient.listSkills(workspaceId, { includeGlobal: true }),
      serverClient.listHubSkills(),
      serverClient.listPlugins(workspaceId, { includeGlobal: true }),
      serverClient.listMcp(workspaceId),
      serverClient.listCommands(workspaceId),
      serverClient.listScheduledJobs(workspaceId),
      supportsRouter ? serverClient.getOpenCodeRouterHealth(workspaceId) : Promise.resolve(null),
      supportsRouter ? serverClient.getOpenCodeRouterBindings(workspaceId) : Promise.resolve({ items: [] as OpenworkOpenCodeRouterBindingsResult["items"] }),
      serverClient.listAudit(workspaceId, 20),
    ]);

    const failures = results.filter((result, index) => index !== 6 && index !== 7 && result.status === "rejected") as Array<PromiseRejectedResult>;

    const skillsResult = results[0].status === "fulfilled" ? results[0].value : { items: [] as OpenworkSkillItem[] };
    const hubSkillsResult = results[1].status === "fulfilled" ? results[1].value : { items: [] as OpenworkHubSkillItem[] };
    const pluginsResult = results[2].status === "fulfilled" ? results[2].value : { items: [] as OpenworkPluginItem[] };
    const mcpResult = results[3].status === "fulfilled" ? results[3].value : { items: [] as OpenworkMcpItem[] };
    const commandsResult = results[4].status === "fulfilled" ? results[4].value : { items: [] as OpenworkCommandItem[] };
    const jobsResult = results[5].status === "fulfilled" ? results[5].value : { items: [] as ScheduledJob[] };
    const routerHealthResult = supportsRouter && results[6].status === "fulfilled" && results[6].value ? results[6].value.json : null;
    const bindingsResult = results[7].status === "fulfilled"
      ? results[7].value
      : { items: [] as OpenworkOpenCodeRouterBindingsResult["items"] };
    const auditResult = results[8].status === "fulfilled" ? results[8].value : { items: [] as OpenworkAuditEntry[] };

    setResources({
      skills: skillsResult.items ?? [],
      hubSkills: hubSkillsResult.items ?? [],
      plugins: pluginsResult.items ?? [],
      mcp: mcpResult.items ?? [],
      commands: commandsResult.items ?? [],
      jobs: jobsResult.items ?? [],
      routerHealth: routerHealthResult,
      routerBindings: bindingsResult.items ?? [],
      audit: auditResult.items ?? [],
    });

    if (failures.length > 0) {
      setResourceError(failures[0].reason instanceof Error ? failures[0].reason.message : String(failures[0].reason));
    }

    setLoadingResources(false);
  }, [serverClient, supportsRouter, workspaceId]);

  useEffect(() => {
    void refreshResources();
  }, [refreshResources]);

  const handleAddPlugin = async () => {
    if (!serverClient || !workspaceId || !pluginSpec.trim()) return;
    setLoadingResources(true);
    setResourceError(null);
    try {
      await serverClient.addPlugin(workspaceId, pluginSpec.trim());
      setPluginSpec("");
      await refreshResources();
    } catch (error) {
      setResourceError(error instanceof Error ? error.message : String(error));
      setLoadingResources(false);
    }
  };

  const handleRemovePlugin = async (name: string) => {
    if (!serverClient || !workspaceId) return;
    setLoadingResources(true);
    setResourceError(null);
    try {
      await serverClient.removePlugin(workspaceId, name);
      await refreshResources();
    } catch (error) {
      setResourceError(error instanceof Error ? error.message : String(error));
      setLoadingResources(false);
    }
  };

  const handleInstallSkill = async (name: string) => {
    if (!serverClient || !workspaceId) return;
    setLoadingResources(true);
    setResourceError(null);
    try {
      await serverClient.installHubSkill(workspaceId, name);
      await refreshResources();
    } catch (error) {
      setResourceError(error instanceof Error ? error.message : String(error));
      setLoadingResources(false);
    }
  };

  const handleReloadEngine = async () => {
    if (!serverClient || !workspaceId) return;
    setLoadingResources(true);
    setResourceError(null);
    try {
      await serverClient.reloadEngine(workspaceId);
      await refreshResources();
    } catch (error) {
      setResourceError(error instanceof Error ? error.message : String(error));
      setLoadingResources(false);
    }
  };

  const handleManualRemoteConnect = async () => {
    if (!remoteHostUrl.trim() || !remoteToken.trim()) {
      setResourceError("Remote worker URL and token are required.");
      return;
    }
    setRemoteConnectBusy(true);
    setResourceError(null);
    try {
      const ok = await connectRemoteWorkspace({
        openworkHostUrl: remoteHostUrl.trim(),
        openworkToken: remoteToken.trim(),
        directory: remoteDirectory.trim() || null,
        displayName: remoteName.trim() || null,
        source: "manual",
      });
      if (ok) {
        setRemoteDirectory("");
        setRemoteName("");
      }
    } finally {
      setRemoteConnectBusy(false);
    }
  };

  const handleOpenCloudWorker = async (worker: DenWorkerSummary) => {
    const orgId = cloudOrgId.trim();
    if (!orgId) return;
    setOpeningCloudWorkerId(worker.workerId);
    setCloudError(null);
    try {
      const tokens = await cloudClient.getWorkerTokens(worker.workerId, orgId);
      const openworkUrl = tokens.openworkUrl?.trim() ?? "";
      const accessToken = tokens.ownerToken?.trim() || tokens.clientToken?.trim() || "";
      if (!openworkUrl || !accessToken) {
        throw new Error("Worker is not ready for remote connection yet.");
      }

      await connectRemoteWorkspace({
        openworkHostUrl: openworkUrl,
        openworkToken: accessToken,
        directory: null,
        displayName: worker.workerName,
        workspaceId: tokens.workspaceId?.trim() || null,
        source: "cloud",
      });
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : String(error));
    } finally {
      setOpeningCloudWorkerId(null);
    }
  };

  const handleThemeModeChange = useCallback((value: ThemeMode) => {
    setThemeMode(value);
  }, []);

  const handleLanguageChange = useCallback((value: Language) => {
    setLocale(value);
    setLanguageState(value);
  }, []);

  const handleToggleHideTitlebar = useCallback(async () => {
    const next = !hideTitlebar;
    setHideTitlebar(next);
    if (!isTauriRuntime()) return;
    try {
      await setWindowDecorations(!next);
    } catch {
      // ignore
    }
  }, [hideTitlebar]);

  const checkForUpdates = useCallback(
    async (options?: { quiet?: boolean }) => {
      if (!isTauriRuntime()) return;

      const env = updateEnv;
      if (env && !env.supported) {
        if (!options?.quiet) {
          setUpdateStatus({
            state: "error",
            lastCheckedAt:
              updateStatus.state === "idle" ? updateStatus.lastCheckedAt : null,
            message: env.reason ?? t("system.updates_not_supported"),
          });
        }
        return;
      }

      const previous = updateStatus;
      setUpdateStatus({ state: "checking", startedAt: Date.now() });
      try {
        const update = (await check({ timeout: 8_000 })) as UpdateHandle | null;
        const checkedAt = Date.now();
        if (!update) {
          setPendingUpdate(null);
          setUpdateStatus({ state: "idle", lastCheckedAt: checkedAt });
          return;
        }

        const notes = typeof update.body === "string" ? update.body : undefined;
        setPendingUpdate({ update, version: update.version, notes });
        setUpdateStatus({
          state: "available",
          lastCheckedAt: checkedAt,
          version: update.version,
          date: update.date,
          notes,
        });
      } catch (error) {
        if (options?.quiet) {
          setUpdateStatus(previous);
          return;
        }
        setPendingUpdate(null);
        setUpdateStatus({
          state: "error",
          lastCheckedAt: null,
          message: error instanceof Error ? error.message : safeStringify(error),
        });
      }
    },
    [updateEnv, updateStatus],
  );

  useEffect(() => {
    if (!updateAutoCheck) return;
    void checkForUpdates({ quiet: true });
  }, [checkForUpdates, updateAutoCheck]);

  const downloadUpdate = useCallback(async () => {
    if (!pendingUpdate) return;
    if (updateStatus.state === "downloading" || updateStatus.state === "ready") return;

    const lastCheckedAt =
      updateStatus.state === "available" ? updateStatus.lastCheckedAt : Date.now();

    setUpdateStatus({
      state: "downloading",
      lastCheckedAt,
      version: pendingUpdate.version,
      totalBytes: null,
      downloadedBytes: 0,
      notes: pendingUpdate.notes,
    });

    let downloadedBytes = 0;
    let totalBytes: number | null = null;

    try {
      await pendingUpdate.update.download((event: any) => {
        if (!event || typeof event !== "object") return;
        const record = event as Record<string, any>;
        if (record.event === "Started") {
          totalBytes =
            record.data && typeof record.data.contentLength === "number"
              ? record.data.contentLength
              : null;
        }
        if (record.event === "Progress") {
          downloadedBytes +=
            record.data && typeof record.data.chunkLength === "number"
              ? record.data.chunkLength
              : 0;
        }
        setUpdateStatus((current) =>
          current.state !== "downloading"
            ? current
            : {
                ...current,
                totalBytes,
                downloadedBytes,
              },
        );
      });

      setUpdateStatus({
        state: "ready",
        lastCheckedAt,
        version: pendingUpdate.version,
        notes: pendingUpdate.notes,
      });
    } catch (error) {
      setUpdateStatus({
        state: "error",
        lastCheckedAt,
        message: error instanceof Error ? error.message : safeStringify(error),
      });
    }
  }, [pendingUpdate, updateStatus.state]);

  useEffect(() => {
    if (!updateAutoDownload || updateStatus.state !== "available") return;
    void downloadUpdate();
  }, [downloadUpdate, updateAutoDownload, updateStatus.state]);

  const installUpdateAndRestart = useCallback(async () => {
    if (!pendingUpdate || anyActiveRuns) return;
    try {
      await pendingUpdate.update.install();
      await pendingUpdate.update.close();
      await relaunch();
    } catch (error) {
      setUpdateStatus({
        state: "error",
        lastCheckedAt: null,
        message: error instanceof Error ? error.message : safeStringify(error),
      });
    }
  }, [anyActiveRuns, pendingUpdate]);

  const revealWorkspaceConfig = useCallback(async () => {
    if (!isTauriRuntime() || revealConfigBusy) return;
    if (!workspaceConfigPath) {
      setConfigActionStatus(t("settings.select_workspace_first"));
      return;
    }
    setRevealConfigBusy(true);
    setConfigActionStatus(null);
    try {
      const { openPath, revealItemInDir } = await import("@tauri-apps/plugin-opener");
      if (isWindowsPlatform()) {
        await openPath(workspaceConfigPath);
      } else {
        await revealItemInDir(workspaceConfigPath);
      }
      setConfigActionStatus(t("settings.revealed_workspace_config"));
    } catch (error) {
      setConfigActionStatus(
        error instanceof Error ? error.message : t("settings.reveal_config_failed"),
      );
    } finally {
      setRevealConfigBusy(false);
    }
  }, [revealConfigBusy, workspaceConfigPath]);

  const resetAppConfigDefaults = useCallback(async () => {
    if (resetConfigBusy) return;
    if (anyActiveRuns) {
      setConfigActionStatus(t("settings.stop_runs_before_reset_config"));
      return;
    }
    setResetConfigBusy(true);
    setConfigActionStatus(null);
    try {
      clearOpenworkLocalStorage();
      if (isTauriRuntime()) {
        await resetOpenworkState("onboarding");
      } else if (typeof window !== "undefined") {
        window.location.reload();
      }
    } catch (error) {
      setConfigActionStatus(
        error instanceof Error ? error.message : t("settings.reset_config_failed"),
      );
    } finally {
      setResetConfigBusy(false);
    }
  }, [anyActiveRuns, resetConfigBusy]);

  const repairOpencodeCache = useCallback(async () => {
    if (!isTauriRuntime()) {
      setCacheRepairResult(t("system.cache_repair_requires_desktop"));
      return;
    }
    if (cacheRepairBusy) return;
    setCacheRepairBusy(true);
    setCacheRepairResult(null);
    try {
      const result = await resetOpencodeCache();
      if (result.errors.length) {
        setCacheRepairResult(result.errors[0]);
      } else if (result.removed.length) {
        setCacheRepairResult(t("settings.cache_repaired"));
      } else {
        setCacheRepairResult(t("settings.cache_nothing_to_repair"));
      }
    } catch (error) {
      setCacheRepairResult(error instanceof Error ? error.message : safeStringify(error));
    } finally {
      setCacheRepairBusy(false);
    }
  }, [cacheRepairBusy]);

  const cleanupOpenworkDockerContainers = useCallback(async () => {
    if (!isTauriRuntime()) {
      setDockerCleanupResult(t("system.docker_cleanup_requires_desktop"));
      return;
    }
    if (dockerCleanupBusy) return;
    setDockerCleanupBusy(true);
    setDockerCleanupResult(null);
    try {
      const result = await sandboxCleanupOpenworkContainers();
      if (!result.candidates.length) {
        setDockerCleanupResult("No OpenWork Docker containers found.");
      } else if (result.errors.length) {
        setDockerCleanupResult(
          `Removed ${result.removed.length}/${result.candidates.length} containers. ${result.errors[0]}`,
        );
      } else {
        setDockerCleanupResult(
          `Removed ${result.removed.length} OpenWork Docker container(s).`,
        );
      }
    } catch (error) {
      setDockerCleanupResult(error instanceof Error ? error.message : safeStringify(error));
    } finally {
      setDockerCleanupBusy(false);
    }
  }, [dockerCleanupBusy]);

  const renderTab = () => {
    if (
      activeTab !== "general" &&
      activeTab !== "appearance" &&
      activeTab !== "updates" &&
      activeTab !== "recovery" &&
      activeTab !== "cloud" &&
      !activeWorkspace
    ) {
      return <EmptyPanel body="Choose a workspace to inspect skills, plugins, scheduler jobs, router state, and audit events." title="No workspace selected" />;
    }

    switch (activeTab) {
      case "general":
        return (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <DetailCard hint="Current worker destination" label="Connected worker" value={server.status === "connected" ? serverHost : "Not connected"} />
              <DetailCard hint="Saved and discovered workspaces" label="Available workspaces" value={String(workspaces.length)} />
              <DetailCard hint="Current selection" label="Current workspace" value={activeWorkspace ? activeWorkspace.displayName || activeWorkspace.name : "Not selected"} />
            </div>

            <div className="ow-soft-card-quiet px-4 py-4 text-sm leading-7 text-slate-600">
              <div className="font-medium text-slate-900">Connection summary</div>
              <div className="mt-2">{activeWorkspace ? selectWorkspaceScopeLabel(activeWorkspace) : "Choose a workspace to start a task or change settings for that worker."}</div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => void handleReloadEngine()} type="button">
                  <RotateCcw className="h-4 w-4" />
                  Reload engine
                </Button>
                <Button variant="secondary" onClick={() => void refreshResources()} type="button">
                  <RefreshCw className="h-4 w-4" />
                  Refresh workspace data
                </Button>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="ow-soft-card-quiet px-4 py-4">
                <div className="ow-panel-heading">Connect remote</div>
                <div className="mt-4 space-y-3">
                  <Input id="openwork-remote-host-url" name="openworkRemoteHostUrl" onChange={(event) => setRemoteHostUrl(event.target.value)} placeholder="OpenWork worker URL" value={remoteHostUrl} />
                  <Input id="openwork-remote-token" name="openworkRemoteToken" onChange={(event) => setRemoteToken(event.target.value)} placeholder="Access token" value={remoteToken} />
                  <Input id="openwork-remote-name" name="openworkRemoteName" onChange={(event) => setRemoteName(event.target.value)} placeholder="Display name (optional)" value={remoteName} />
                  <Input id="openwork-remote-directory" name="openworkRemoteDirectory" onChange={(event) => setRemoteDirectory(event.target.value)} placeholder="Directory hint (optional)" value={remoteDirectory} />
                  <Button disabled={remoteConnectBusy} variant="secondary" onClick={() => void handleManualRemoteConnect()} type="button">
                    <PlugZap className="h-4 w-4" />
                    {remoteConnectBusy ? "Connecting..." : "Connect remote"}
                  </Button>
                </div>
              </div>

              <div className="ow-soft-card-quiet px-4 py-4">
                <div className="ow-panel-heading">Saved workers</div>
                <div className="mt-4 space-y-2">
                  {workerProfiles.length ? workerProfiles.map((profile) => (
                    <div className={profile.id === activeWorkerProfileId ? "ow-worker-item ow-worker-item-active" : "ow-worker-item"} key={profile.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-slate-900">{profile.displayName}</div>
                          <div className="mt-1 text-sm leading-6 text-slate-500">{profile.hostUrl}</div>
                        </div>
                        <Button variant="secondary" onClick={() => removeWorkerProfile(profile.id)} type="button">
                          Remove
                        </Button>
                      </div>
                    </div>
                  )) : <EmptyPanel body="Remote workers you connect manually or from Cloud will be saved here for quick switching." title="No saved workers" />}
                </div>
              </div>
            </div>
          </div>
        );

      case "advanced":
        return (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <DetailCard
                hint="Current OpenWork server state"
                label="Server"
                value={server.status}
              />
              <DetailCard
                hint="Resolved worker host"
                label="Worker host"
                value={serverHost}
              />
              <DetailCard
                hint="Current runtime directory"
                label="Workspace scope"
                value={
                  activeWorkspace
                    ? selectWorkspaceScopeLabel(activeWorkspace)
                    : "Not selected"
                }
              />
              <DetailCard
                hint="Execution backend reported by the server"
                label="Sandbox"
                value={
                  server.capabilities?.sandbox?.enabled
                    ? server.capabilities.sandbox.backend
                    : "Disabled"
                }
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="ow-soft-card-quiet px-4 py-4">
                <div className="ow-panel-heading">Runtime controls</div>
                <div className="mt-4 space-y-4 text-sm leading-7 text-slate-600">
                  <div>
                    Use these controls when the connected workspace looks stale,
                    capabilities changed under the app, or the runtime needs a
                    manual resync.
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => void handleReloadEngine()}
                      type="button"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Reload engine
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => void refreshResources()}
                      type="button"
                    >
                      <Wrench className="h-4 w-4" />
                      Refresh workspace data
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => void refreshServer()}
                      type="button"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Re-check server
                    </Button>
                  </div>

                  <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Authorized roots
                    </div>
                    <div className="mt-3 space-y-2">
                      {server.diagnostics?.authorizedRoots?.length ? (
                        server.diagnostics.authorizedRoots.map((root) => (
                          <div
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700"
                            key={root}
                          >
                            {root}
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-slate-500">
                          No authorized roots were reported by the current
                          server.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-3">
                <DetailCard
                  hint="Server-reported version"
                  label="Version"
                  value={server.version ?? server.diagnostics?.version ?? "Unknown"}
                />
                <DetailCard
                  hint="Workspaces visible to the connected server"
                  label="Workspace count"
                  value={String(server.diagnostics?.workspaceCount ?? workspaces.length)}
                />
                <DetailCard
                  hint="Current approval configuration"
                  label="Approval mode"
                  value={server.diagnostics?.approval?.mode ?? "Unknown"}
                />
                <DetailCard
                  hint="Router support reported by the server"
                  label="OpenCode Router"
                  value={
                    server.capabilities?.proxy?.opencodeRouter
                      ? "Enabled"
                      : "Unavailable"
                  }
                />
                <DetailCard
                  hint="Skill read/write support"
                  label="Skills access"
                  value={capabilitySummary(server.capabilities?.skills)}
                />
                <DetailCard
                  hint="Plugin read/write support"
                  label="Plugin access"
                  value={capabilitySummary(server.capabilities?.plugins)}
                />
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="ow-soft-card-quiet px-4 py-4">
                <div className="ow-panel-heading">Capabilities JSON</div>
                <pre className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs leading-6 text-slate-600">
                  {safeStringify(server.capabilities)}
                </pre>
              </div>

              <div className="ow-soft-card-quiet px-4 py-4">
                <div className="ow-panel-heading">Diagnostics JSON</div>
                <pre className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs leading-6 text-slate-600">
                  {safeStringify(server.diagnostics)}
                </pre>
              </div>
            </div>
          </div>
        );

      case "appearance":
        return (
          <AppearanceSettings
            busy={false}
            themeMode={themeMode}
            onThemeModeChange={handleThemeModeChange}
            language={language}
            onLanguageChange={handleLanguageChange}
            showWindowAppearance={isTauriRuntime()}
            hideTitlebar={hideTitlebar}
            onToggleHideTitlebar={() => void handleToggleHideTitlebar()}
          />
        );

      case "updates":
        return (
          <UpdatesSettings
            busy={updateStatus.state === "checking" || updateStatus.state === "downloading"}
            webDeployment={!isTauriRuntime()}
            appVersion={server.version ?? null}
            updateAutoCheck={updateAutoCheck}
            onToggleUpdateAutoCheck={() => setUpdateAutoCheck((value) => !value)}
            updateAutoDownload={updateAutoDownload}
            onToggleUpdateAutoDownload={() => setUpdateAutoDownload((value) => !value)}
            updateStatus={updateStatus}
            updateEnv={updateEnv}
            onCheckForUpdates={() => void checkForUpdates()}
            onDownloadUpdate={() => void downloadUpdate()}
            onInstallUpdateAndRestart={() => void installUpdateAndRestart()}
            anyActiveRuns={anyActiveRuns}
            updateRestartBlockedMessage={updateRestartBlockedMessage}
          />
        );

      case "recovery":
        return (
          <RecoverySettings
            workspaceConfigPath={workspaceConfigPath}
            showDesktopActions={isTauriRuntime()}
            revealConfigBusy={revealConfigBusy}
            onRevealWorkspaceConfig={() => void revealWorkspaceConfig()}
            resetConfigBusy={resetConfigBusy}
            onResetAppConfigDefaults={() => void resetAppConfigDefaults()}
            anyActiveRuns={anyActiveRuns}
            configActionStatus={configActionStatus}
            cacheRepairBusy={cacheRepairBusy}
            cacheRepairResult={cacheRepairResult}
            onRepairOpencodeCache={() => void repairOpencodeCache()}
            dockerCleanupBusy={dockerCleanupBusy}
            dockerCleanupResult={dockerCleanupResult}
            onCleanupDockerContainers={() => void cleanupOpenworkDockerContainers()}
          />
        );

      case "cloud":
        return (
          <div className="space-y-4">
            <div className="ow-soft-card-quiet px-4 py-4">
              <div className="ow-panel-heading">OpenWork Cloud</div>
              <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <div className="grid gap-3 md:grid-cols-2">
                  <Input id="openwork-cloud-base-url" name="openworkCloudBaseUrl" onChange={(event) => setCloudBaseUrl(event.target.value)} placeholder={DEFAULT_DEN_BASE_URL} value={cloudBaseUrl} />
                  <Input id="openwork-cloud-token" name="openworkCloudToken" onChange={(event) => setCloudToken(event.target.value)} placeholder="Cloud auth token" value={cloudToken} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="ow-button-secondary" onClick={() => window.open(buildDenAuthUrl(cloudBaseUrl, "sign-in"), "_blank")} type="button">
                    Sign in
                  </button>
                  <button className="ow-button-secondary" onClick={() => void refreshCloud()} type="button">
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                  </button>
                </div>
              </div>
              {cloudError ? <div className="mt-4 text-sm text-rose-700">{cloudError}</div> : null}
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="ow-soft-card-quiet px-4 py-4">
                <div className="ow-panel-heading">Session</div>
                {cloudUser ? (
                  <div className="mt-4 space-y-3 text-sm text-slate-600">
                    <DetailCard hint="Signed-in cloud account" label="User" value={cloudUser.email} />
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Organization</div>
                      <select className="ow-input" id="openwork-cloud-org" name="openworkCloudOrg" onChange={(event) => setCloudOrgId(event.target.value)} value={cloudOrgId}>
                        {cloudOrgs.map((org) => (
                          <option key={org.id} value={org.id}>{org.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <EmptyPanel body="Sign in to OpenWork Cloud and provide a token to load hosted workers and org data." title="Not signed in" />
                )}
              </div>

              <div className="ow-soft-card-quiet px-4 py-4">
                <div className="ow-panel-heading">Hosted workers</div>
                <div className="mt-4 space-y-2">
                  {cloudWorkers.length ? cloudWorkers.map((worker) => (
                    <div className="ow-worker-item" key={worker.workerId}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-slate-900">{worker.workerName}</div>
                          <div className="mt-1 text-sm text-slate-500">{worker.status} · {worker.instanceUrl || worker.provider || "No URL yet"}</div>
                        </div>
                        <button className="ow-button-secondary" disabled={openingCloudWorkerId === worker.workerId || !worker.instanceUrl} onClick={() => void handleOpenCloudWorker(worker)} type="button">
                          {openingCloudWorkerId === worker.workerId ? "Opening..." : "Open worker"}
                        </button>
                      </div>
                    </div>
                  )) : <EmptyPanel body={cloudBusy ? "Loading workers..." : "No cloud workers are available for the selected org yet."} title="No hosted workers" />}
                </div>
              </div>
            </div>
          </div>
        );

      case "skills":
        return (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-3">
              <div className="ow-panel-heading">Installed skills</div>
              {resources.skills.length ? (
                resources.skills.map((skill) => (
                  <div className="ow-soft-card-quiet px-4 py-4" key={skill.path}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-slate-900">{skill.name}</div>
                        <div className="mt-1 text-sm leading-6 text-slate-500">{skill.description || skill.path}</div>
                      </div>
                      <span className="ow-status-pill ow-status-pill-neutral">{skill.scope}</span>
                    </div>
                    {skill.trigger ? <div className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-400">Trigger: {skill.trigger}</div> : null}
                  </div>
                ))
              ) : (
                <EmptyPanel body="This workspace does not currently expose any installed skills through the server API." title="No installed skills" />
              )}
            </div>

            <div className="space-y-3">
              <div className="ow-panel-heading">Skill hub</div>
              {resources.hubSkills.length ? (
                resources.hubSkills.slice(0, 12).map((skill) => (
                  <div className="ow-soft-card-quiet px-4 py-4" key={`${skill.source.owner}/${skill.source.repo}/${skill.name}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-slate-900">{skill.name}</div>
                        <div className="mt-1 text-sm leading-6 text-slate-500">{skill.description}</div>
                        <div className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-400">
                          {skill.source.owner}/{skill.source.repo}@{skill.source.ref}
                        </div>
                      </div>
                      <button className="ow-button-secondary" onClick={() => void handleInstallSkill(skill.name)} type="button">
                        Install
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyPanel body="The skill hub list could not be loaded or is empty for the current repo source." title="No hub skills" />
              )}
            </div>
          </div>
        );

      case "extensions":
        return (
          <div className="space-y-4">
            <div className="ow-soft-card-quiet px-4 py-4">
              <div className="ow-panel-heading">Plugins</div>
              <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
                <input className="ow-input" onChange={(event) => setPluginSpec(event.target.value)} placeholder="npm package or plugin spec" value={pluginSpec} />
                <button className="ow-button-secondary" onClick={() => void handleAddPlugin()} type="button">
                  Add plugin
                </button>
              </div>
              <div className="mt-4 space-y-2">
                {resources.plugins.length ? resources.plugins.map((plugin) => (
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3" key={`${plugin.scope}:${plugin.spec}`}>
                    <div>
                      <div className="font-medium text-slate-900">{plugin.spec}</div>
                      <div className="mt-1 text-sm text-slate-500">{plugin.source} · {plugin.scope}</div>
                    </div>
                    <button className="ow-button-secondary" onClick={() => void handleRemovePlugin(plugin.spec)} type="button">
                      Remove
                    </button>
                  </div>
                )) : <EmptyPanel body="No plugins are currently configured for this workspace." title="No plugins" />}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="ow-soft-card-quiet px-4 py-4">
                <div className="ow-panel-heading">MCP servers</div>
                <div className="mt-4 space-y-2">
                  {resources.mcp.length ? resources.mcp.map((item) => (
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3" key={item.name}>
                      <div className="font-medium text-slate-900">{item.name}</div>
                      <div className="mt-1 text-sm text-slate-500">{item.source}</div>
                    </div>
                  )) : <EmptyPanel body="No MCP servers are configured for this workspace." title="No MCP servers" />}
                </div>
              </div>

              <div className="ow-soft-card-quiet px-4 py-4">
                <div className="ow-panel-heading">Commands</div>
                <div className="mt-4 space-y-2">
                  {resources.commands.length ? resources.commands.map((command) => (
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3" key={command.name}>
                      <div className="font-medium text-slate-900">/{command.name}</div>
                      <div className="mt-1 text-sm text-slate-500">{command.description || command.template}</div>
                    </div>
                  )) : <EmptyPanel body="No custom commands are available for this workspace." title="No commands" />}
                </div>
              </div>
            </div>
          </div>
        );

      case "automations":
        return resources.jobs.length ? (
          <div className="space-y-3">
            {resources.jobs.map((job) => (
              <div className="ow-soft-card-quiet px-4 py-4" key={job.slug}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-slate-900">{job.name}</div>
                    <div className="mt-1 text-sm leading-6 text-slate-500">{job.schedule}</div>
                  </div>
                  <span className="ow-status-pill ow-status-pill-neutral">{job.lastRunStatus || "never run"}</span>
                </div>
                <div className="mt-3 text-sm leading-6 text-slate-500">
                  {job.lastRunAt ? `Last run ${formatRelativeTime(new Date(job.lastRunAt).getTime())}` : "No runs recorded yet."}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyPanel body="No scheduled jobs are configured for this workspace yet." title="No automations" />
        );

      case "messaging":
        return (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="ow-soft-card-quiet px-4 py-4">
              <div className="ow-panel-heading">Router health</div>
              {resources.routerHealth ? (
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <DetailCard hint="OpenCode endpoint seen by the router" label="OpenCode" value={resources.routerHealth.opencode.url} />
                  <DetailCard hint="Healthy channel count" label="Healthy channels" value={String(Object.values(resources.routerHealth.channels).filter(Boolean).length)} />
                  <DetailCard hint="Group messaging mode" label="Groups" value={resources.routerHealth.config.groupsEnabled ? "Enabled" : "Disabled"} />
                </div>
              ) : (
                <EmptyPanel body="OpenCode Router health could not be loaded for the active workspace." title="No messaging health" />
              )}
            </div>

            <div className="ow-soft-card-quiet px-4 py-4">
              <div className="ow-panel-heading">Bindings</div>
              <div className="mt-4 space-y-2">
                {resources.routerBindings.length ? resources.routerBindings.map((binding) => (
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3" key={`${binding.channel}:${binding.peerId}:${binding.identityId}`}>
                    <div className="font-medium text-slate-900">{binding.channel} · {binding.peerId}</div>
                    <div className="mt-1 text-sm text-slate-500">identity {binding.identityId} · {binding.directory || "no directory"}</div>
                  </div>
                )) : <EmptyPanel body="No router bindings are currently configured." title="No bindings" />}
              </div>
            </div>
          </div>
        );

      case "debug":
        return (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="ow-soft-card-quiet px-4 py-4">
              <div className="ow-panel-heading">Audit trail</div>
              <div className="mt-4 space-y-2">
                {resources.audit.length ? resources.audit.map((entry) => (
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3" key={entry.id}>
                    <div className="font-medium text-slate-900">{entry.summary}</div>
                    <div className="mt-1 text-sm text-slate-500">{entry.action} · {entry.target}</div>
                    <div className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">{formatRelativeTime(entry.timestamp)}</div>
                  </div>
                )) : <EmptyPanel body="No audit entries are available yet for this workspace." title="No audit events" />}
              </div>
            </div>

            <div className="ow-soft-card-quiet px-4 py-4">
              <div className="ow-panel-heading">Client logs</div>
              <div className="mt-4 space-y-2">
                {logs.length ? logs.map((line, index) => (
                  <pre className="overflow-x-auto rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs leading-6 text-slate-600" key={`${line}-${index}`}>
                    {line}
                  </pre>
                )) : <EmptyPanel body="No client-side issues have been captured in the rewrite session yet." title="No logs" />}
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <section className="space-y-4">
      <CardShell className="px-5 py-5 lg:px-6 lg:py-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="ow-kicker">
              <Sparkles className="h-3.5 w-3.5" />
              Settings
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Workspaces, cloud, and connected tools</h1>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
                Manage how OpenWork connects to workers, where your workspaces live, and which tools are available inside them.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => navigate("/session")}
              type="button"
            >
              Back to session
            </Button>
            <Button variant="secondary" onClick={() => void refreshServer()} type="button">
              <RefreshCw className="h-4 w-4" />
              Re-check server
            </Button>
            <Button variant="secondary" onClick={() => void refreshResources()} type="button">
              <Wrench className="h-4 w-4" />
              Refresh workspace data
            </Button>
          </div>
        </div>

        <form
          className="mt-6 grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void connectToServer({ url, token });
          }}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="space-y-2 text-sm text-slate-700" htmlFor="openwork-server-url">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Server URL</span>
              <Input id="openwork-server-url" name="openworkServerUrl" onChange={(event) => setUrl(event.target.value)} placeholder="http://localhost:8787" value={url} />
            </label>
            <label className="space-y-2 text-sm text-slate-700" htmlFor="openwork-server-token">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Client token</span>
              <Input id="openwork-server-token" name="openworkServerToken" onChange={(event) => setToken(event.target.value)} placeholder="paste the OpenWork client token" value={token} />
            </label>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="submit">
              <PlugZap className="h-4 w-4" />
              Connect
            </Button>
            <span className={server.status === "connected" ? "ow-status-pill ow-status-pill-positive" : "ow-status-pill ow-status-pill-neutral"}>{server.status}</span>
            <span className="ow-status-pill ow-status-pill-neutral">{server.version ? `v${server.version}` : "version pending"}</span>
            <span className="ow-status-pill ow-status-pill-neutral">{workspacesStatus}</span>
          </div>
        </form>
      </CardShell>

      {resourceError ? (
        <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {resourceError}
        </div>
      ) : null}

      <Tabs className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]" onValueChange={(value) => handleTabChange(value as SettingsTab)} value={activeTab}>
        <aside>
          <CardShell className="overflow-hidden px-3 py-3">
            <TabsList className="gap-5">
              <div className="space-y-2">
                <div className="px-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Workspace settings
                </div>
                {workspaceTabs.map((tab) => (
                  <TabsTrigger key={tab.id} value={tab.id}>
                    <div className="font-medium text-slate-900">{tab.label}</div>
                    <div className="mt-1 text-sm leading-6 text-slate-500">{tab.description}</div>
                  </TabsTrigger>
                ))}
              </div>

              <div className="space-y-2">
                <div className="px-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  App settings
                </div>
                {globalTabs.map((tab) => (
                  <TabsTrigger key={tab.id} value={tab.id}>
                    <div className="font-medium text-slate-900">{tab.label}</div>
                    <div className="mt-1 text-sm leading-6 text-slate-500">{tab.description}</div>
                  </TabsTrigger>
                ))}
              </div>
            </TabsList>

            <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-600">
            {activeWorkspace ? (
              <>
                <div className="flex items-center gap-2 font-medium text-slate-900">
                  <Check className="h-4 w-4 text-emerald-600" />
                  {activeWorkspace.displayName || activeWorkspace.name}
                </div>
                <div className="mt-2">{selectWorkspaceScopeLabel(activeWorkspace)}</div>
              </>
            ) : (
              <div>No active workspace selected yet.</div>
            )}
            </div>
          </CardShell>
        </aside>

        <TabsContent value={activeTab} className="space-y-4">
          <CardShell className="px-5 py-5 lg:px-6 lg:py-6">
            <div className="space-y-3">
              <div className="ow-kicker">
                <Sparkles className="h-3.5 w-3.5" />
                {activeTabMeta.label}
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">
                  {activeTabMeta.label}
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
                  {activeTabMeta.description}
                </p>
              </div>
            </div>
          </CardShell>

          {loadingResources ? (
            <CardShell className="flex items-center gap-3 px-4 py-4 text-sm text-slate-600">
              <LoaderState />
              Loading workspace capability data...
            </CardShell>
          ) : null}
          {renderTab()}
        </TabsContent>
      </Tabs>
    </section>
  );
}

function LoaderState() {
  return <RefreshCw className="h-4 w-4 animate-spin" />;
}
