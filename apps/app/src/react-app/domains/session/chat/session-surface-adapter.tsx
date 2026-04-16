import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Agent,
  AgentPartInput,
  FilePartInput,
  TextPartInput,
} from "@opencode-ai/sdk/v2/client";

import {
  DEFAULT_MODEL,
  MODEL_PREF_KEY,
  VARIANT_PREF_KEY,
} from "../../../../app/constants";
import { createClient, unwrap } from "../../../../app/lib/opencode";
import {
  compactSession,
  listCommands as listCommandsTyped,
  shellInSession,
} from "../../../../app/lib/opencode-session";
import { resolveOpenworkSessionRuntime } from "../../../../app/lib/openwork-session-runtime";
import {
  createOpenworkServerClient,
  type OpenworkWorkspaceInfo,
} from "../../../../app/lib/openwork-server";
import {
  toolMenuSectionToSettingsTab,
  type ComposerToolMenuMcpItem,
  type ToolMenuSection,
} from "../../../../app/session/composer-tools";
import type {
  ComposerAttachment,
  ComposerDraft,
  ModelRef,
  SkillCard,
} from "../../../../app/types";
import {
  formatModelLabel,
  parseModelRef,
  safeStringify,
} from "../../../../app/utils";
import { ReactSessionRuntime } from "../sync/runtime-sync";
import { SessionSurface } from "../surface/session-surface";

type SessionSurfaceAdapterProps = {
  workspace: OpenworkWorkspaceInfo;
  sessionId: string;
  serverUrl: string;
  serverToken: string;
  serverStatus: string;
  workingFiles: string[];
  hasEarlierMessages: boolean;
  loadingEarlierMessages: boolean;
  onLoadEarlierMessages: () => void | Promise<void>;
  onOpenSettingsTab: (tab: string) => void;
};

function readStoredModel() {
  if (typeof window === "undefined") return DEFAULT_MODEL;
  return parseModelRef(window.localStorage.getItem(MODEL_PREF_KEY)) ?? DEFAULT_MODEL;
}

function readStoredVariant() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(VARIANT_PREF_KEY);
  return raw?.trim() || null;
}

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error(`Failed to read attachment: ${file.name}`));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result);
    };
    reader.readAsDataURL(file);
  });

function workspaceRoot(workspace: OpenworkWorkspaceInfo) {
  return (
    workspace.opencode?.directory?.trim() ||
    workspace.directory?.trim() ||
    workspace.path?.trim() ||
    ""
  );
}

function toAbsolutePath(root: string, path: string) {
  const trimmed = path.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/")) return trimmed;
  if (/^[a-zA-Z]:\\/.test(trimmed)) return trimmed;
  if (!root) return "";
  return `${root.replace(/[\\/]+$/, "")}/${trimmed}`.replace(/\/{2,}/g, "/");
}

function filenameFromPath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? "file";
}

async function attachmentToFilePart(
  attachment: ComposerAttachment,
): Promise<FilePartInput> {
  return {
    type: "file",
    url: await fileToDataUrl(attachment.file),
    filename: attachment.name,
    mime: attachment.mimeType,
  };
}

async function buildPromptParts(
  draft: ComposerDraft,
  root: string,
): Promise<Array<TextPartInput | AgentPartInput | FilePartInput>> {
  const text = draft.resolvedText ?? draft.text;
  const parts: Array<TextPartInput | AgentPartInput | FilePartInput> = [
    {
      type: "text",
      text,
    } as TextPartInput,
  ];

  for (const part of draft.parts) {
    if (part.type === "agent") {
      parts.push({ type: "agent", name: part.name } as AgentPartInput);
      continue;
    }
    if (part.type !== "file") continue;
    const absolute = toAbsolutePath(root, part.path);
    if (!absolute) continue;
    parts.push({
      type: "file",
      mime: "text/plain",
      url: `file://${absolute}`,
      filename: filenameFromPath(part.path),
    } as FilePartInput);
  }

  parts.push(...(await Promise.all(draft.attachments.map(attachmentToFilePart))));
  return parts;
}

async function buildCommandFileParts(
  draft: ComposerDraft,
  root: string,
): Promise<FilePartInput[]> {
  const parts: FilePartInput[] = [];
  for (const part of draft.parts) {
    if (part.type !== "file") continue;
    const absolute = toAbsolutePath(root, part.path);
    if (!absolute) continue;
    parts.push({
      type: "file",
      mime: "text/plain",
      url: `file://${absolute}`,
      filename: filenameFromPath(part.path),
    } as FilePartInput);
  }

  parts.push(...(await Promise.all(draft.attachments.map(attachmentToFilePart))));
  return parts;
}

function mcpDetails(record: ComposerToolMenuMcpItem["status"], rawConfig: Record<string, unknown>, source: string) {
  void record;
  const command = rawConfig.command;
  if (typeof command === "string" && command.trim()) return command;
  if (Array.isArray(command)) {
    const joined = command
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
      .join(" ");
    if (joined) return joined;
  }
  const url = rawConfig.url;
  if (typeof url === "string" && url.trim()) return url;
  return source;
}

export function SessionSurfaceAdapter(props: SessionSurfaceAdapterProps) {
  const [skills, setSkills] = useState<SkillCard[]>([]);
  const [mcpItems, setMcpItems] = useState<ComposerToolMenuMcpItem[]>([]);
  const [selectedAgentBySession, setSelectedAgentBySession] = useState<
    Record<string, string | null>
  >({});
  const [modelBySession, setModelBySession] = useState<Record<string, ModelRef>>(
    {},
  );
  const [modelVariantBySession, setModelVariantBySession] = useState<
    Record<string, string | null>
  >({});

  const workspaceId = props.workspace.id;
  const root = useMemo(() => workspaceRoot(props.workspace), [props.workspace]);
  const serverClient = useMemo(() => {
    const baseUrl = props.serverUrl.trim();
    if (!baseUrl) return null;
    return createOpenworkServerClient({
      baseUrl,
      token: props.serverToken.trim() || undefined,
    });
  }, [props.serverToken, props.serverUrl]);

  const runtime = useMemo(
    () =>
      resolveOpenworkSessionRuntime({
        workspaceId,
        client: serverClient,
        settings: { token: props.serverToken },
      }),
    [props.serverToken, serverClient, workspaceId],
  );

  const workspaceClient = useMemo(() => {
    if (!runtime) return null;
    return createClient(runtime.opencodeBaseUrl, undefined, {
      token: runtime.openworkToken,
      mode: "openwork",
    });
  }, [runtime]);

  const sessionModel = modelBySession[props.sessionId] ?? readStoredModel();
  const modelVariant = modelVariantBySession[props.sessionId] ?? readStoredVariant();
  const selectedAgent = selectedAgentBySession[props.sessionId] ?? null;

  useEffect(() => {
    if (!serverClient || !workspaceId) {
      setSkills([]);
      setMcpItems([]);
      return;
    }

    let cancelled = false;
    void Promise.allSettled([
      serverClient.listSkills(workspaceId, { includeGlobal: true }),
      serverClient.listMcp(workspaceId),
    ]).then(([skillsResult, mcpResult]) => {
      if (cancelled) return;

      if (skillsResult.status === "fulfilled") {
        setSkills(
          skillsResult.value.items.map((item) => ({
            name: item.name,
            path: item.path,
            description: item.description,
            trigger: item.trigger,
          })),
        );
      } else {
        setSkills([]);
      }

      if (mcpResult.status === "fulfilled") {
        setMcpItems(
          mcpResult.value.items.map((item) => ({
            name: item.name,
            status: undefined,
            details: mcpDetails(undefined, item.config ?? {}, item.source),
          })),
        );
      } else {
        setMcpItems([]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [serverClient, workspaceId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(MODEL_PREF_KEY, `${sessionModel.providerID}/${sessionModel.modelID}`);
  }, [sessionModel]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (modelVariant) {
      window.localStorage.setItem(VARIANT_PREF_KEY, modelVariant);
      return;
    }
    window.localStorage.removeItem(VARIANT_PREF_KEY);
  }, [modelVariant]);

  const listAgents = useCallback(async (): Promise<Agent[]> => {
    if (!workspaceClient) return [];
    const list = unwrap(await workspaceClient.app.agents());
    return list.filter((agent) => !agent.hidden && agent.mode !== "subagent");
  }, [workspaceClient]);

  const listCommands = useCallback(async () => {
    if (!workspaceClient) return [];
    return listCommandsTyped(workspaceClient, root || undefined);
  }, [root, workspaceClient]);

  const searchFiles = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!workspaceClient || !trimmed) return [];
      try {
        const result = unwrap(
          await workspaceClient.find.files({
            query: trimmed,
            dirs: "true",
            limit: 50,
            directory: root || undefined,
          }),
        );
        return Array.isArray(result) ? result : [];
      } catch {
        return [];
      }
    },
    [root, workspaceClient],
  );

  const sendDraft = useCallback(
    async (draft: ComposerDraft) => {
      if (!workspaceClient) {
        throw new Error("OpenCode proxy is not connected.");
      }

      const content = (draft.resolvedText ?? draft.text).trim();
      if (!content && !draft.attachments.length) return;

      const compactShortcut = /^\/compact(?:\s+.*)?$/i.test(content);
      const compactCommand =
        draft.command?.name === "compact" || compactShortcut;

      if (draft.mode === "shell") {
        await shellInSession(workspaceClient, props.sessionId, content);
        return;
      }

      if (compactCommand) {
        await compactSession(workspaceClient, props.sessionId, sessionModel, {
          directory: root || undefined,
        });
        return;
      }

      if (draft.command) {
        const files = await buildCommandFileParts(draft, root);
        const result = await workspaceClient.session.command({
          sessionID: props.sessionId,
          command: draft.command.name,
          arguments: draft.command.arguments,
          agent: selectedAgent ?? undefined,
          model: `${sessionModel.providerID}/${sessionModel.modelID}`,
          variant: modelVariant ?? undefined,
          parts: files.length ? files : undefined,
        });
        const maybe = result as { error?: unknown } | null | undefined;
        if (maybe?.error !== undefined) {
          throw new Error(
            maybe.error instanceof Error
              ? maybe.error.message
              : safeStringify(maybe.error),
          );
        }
        return;
      }

      const parts = await buildPromptParts(draft, root);
      const result = await workspaceClient.session.promptAsync({
        sessionID: props.sessionId,
        model: sessionModel,
        agent: selectedAgent ?? undefined,
        variant: modelVariant ?? undefined,
        parts,
      });
      const maybe = result as { error?: unknown } | null | undefined;
      if (maybe?.error !== undefined) {
        throw new Error(
          maybe.error instanceof Error
            ? maybe.error.message
            : safeStringify(maybe.error),
        );
      }
    },
    [
      modelVariant,
      props.sessionId,
      root,
      selectedAgent,
      sessionModel,
      workspaceClient,
    ],
  );

  const attachmentsEnabled =
    props.workspace.workspaceType !== "remote" || props.serverStatus === "connected";
  const attachmentsDisabledReason = attachmentsEnabled
    ? null
    : "Connect to the OpenWork server to attach files in a remote workspace.";

  const agentLabel = selectedAgent || "Auto agent";
  const mcpStatusText = mcpItems.length
    ? `${mcpItems.length} MCP server${mcpItems.length === 1 ? "" : "s"} configured`
    : "Configured MCP servers";

  if (!runtime || !serverClient) {
    return (
      <div className="px-6 py-16">
        <div className="mx-auto max-w-xl rounded-3xl border border-amber-200 bg-amber-50 px-6 py-5 text-sm text-amber-900">
          Connect to the OpenWork server to load the full React session surface.
        </div>
      </div>
    );
  }

  return (
    <>
      <ReactSessionRuntime
        workspaceId={runtime.workspaceId}
        opencodeBaseUrl={runtime.opencodeBaseUrl}
        openworkToken={runtime.openworkToken}
      />
      <SessionSurface
        client={serverClient}
        workspaceId={workspaceId}
        sessionId={props.sessionId}
        opencodeBaseUrl={runtime.opencodeBaseUrl}
        openworkToken={runtime.openworkToken}
        developerMode={Boolean(import.meta.env.DEV)}
        modelLabel={formatModelLabel(sessionModel)}
        onModelClick={() => props.onOpenSettingsTab("general")}
        onSendDraft={sendDraft}
        onDraftChange={() => undefined}
        attachmentsEnabled={attachmentsEnabled}
        attachmentsDisabledReason={attachmentsDisabledReason}
        modelVariantLabel={modelVariant || "Default"}
        modelVariant={modelVariant}
        modelBehaviorOptions={[]}
        onModelVariantChange={(value) =>
          setModelVariantBySession((current) => ({
            ...current,
            [props.sessionId]: value,
          }))
        }
        agentLabel={agentLabel}
        selectedAgent={selectedAgent}
        listAgents={listAgents}
        onSelectAgent={(agent) =>
          setSelectedAgentBySession((current) => ({
            ...current,
            [props.sessionId]: agent,
          }))
        }
        listCommands={listCommands}
        skills={skills}
        mcpItems={mcpItems}
        mcpStatusText={mcpStatusText}
        onOpenSettings={(section: ToolMenuSection) =>
          props.onOpenSettingsTab(toolMenuSectionToSettingsTab(section))
        }
        recentFiles={props.workingFiles}
        searchFiles={searchFiles}
        isRemoteWorkspace={props.workspace.workspaceType === "remote"}
        isSandboxWorkspace={false}
        hasEarlierMessages={props.hasEarlierMessages}
        loadingEarlierMessages={props.loadingEarlierMessages}
        onLoadEarlierMessages={props.onLoadEarlierMessages}
        onUploadInboxFiles={null}
      />
    </>
  );
}
