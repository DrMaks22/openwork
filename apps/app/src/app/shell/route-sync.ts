import { createEffect } from "solid-js";
import type { Accessor } from "solid-js";

import type { SettingsTab } from "../types";
import { shouldRedirectMissingSessionAfterScopedLoad } from "../lib/session-scope";
import { normalizeDirectoryPath } from "../utils";

type SessionRouteSyncArgs = {
  pathname: Accessor<string>;
  navigate: (href: string, options?: { replace?: boolean }) => void;
  settingsTab: Accessor<SettingsTab>;
  setSettingsTabState: (tab: SettingsTab) => void;
  setSelectedSessionId: (value: string | null) => void;
  selectedSessionId: Accessor<string | null>;
  selectSession: (sessionId: string) => Promise<void> | void;
  pendingInitialSessionSelection: Accessor<unknown>;
  sessions: Accessor<Array<{ id: string; directory?: string | null }>>;
  sessionsLoaded: Accessor<boolean>;
  loadedSessionScopeRoot: Accessor<string>;
  selectedWorkspaceRoot: Accessor<string>;
  clearSelectedSessionSurface: () => void;
  activeSessionId: Accessor<string | null>;
  goToSettings: (tab: SettingsTab, options?: { replace?: boolean }) => void;
  goToSession: (sessionId: string, options?: { replace?: boolean }) => void;
};

const settingsTabs = new Set<SettingsTab>([
  "general",
  "den",
  "automations",
  "skills",
  "extensions",
  "messaging",
  "advanced",
  "appearance",
  "updates",
  "recovery",
  "debug",
]);

export function resolveSettingsTab(value?: string | null) {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (settingsTabs.has(normalized as SettingsTab)) {
    return normalized as SettingsTab;
  }
  return "general";
}

export function syncShellRoute(args: SessionRouteSyncArgs) {
  createEffect(() => {
    const rawPath = args.pathname().trim();
    const path = rawPath.toLowerCase();

    if (path === "" || path === "/") {
      args.navigate("/session", { replace: true });
      return;
    }

    if (path.startsWith("/settings")) {
      const [, , tabSegment] = path.split("/");
      const resolvedTab = resolveSettingsTab(tabSegment);

      if (resolvedTab !== args.settingsTab()) {
        args.setSettingsTabState(resolvedTab);
      }
      if (!tabSegment || tabSegment !== resolvedTab) {
        args.goToSettings(resolvedTab, { replace: true });
      }
      return;
    }

    if (path.startsWith("/session")) {
      const [, , sessionSegment] = rawPath.split("/");
      const id = (sessionSegment ?? "").trim();

      if (!id) {
        if (args.selectedSessionId()) {
          args.clearSelectedSessionSurface();
        }
        return;
      }

      const pendingInitialSelection = args.pendingInitialSessionSelection();
      const selectedWorkspaceRoot = normalizeDirectoryPath(
        args.selectedWorkspaceRoot().trim(),
      );
      const matchingSession = args.sessions().find((session) => session.id === id) ?? null;
      const hasMatchingSessionInScope = matchingSession
        ? !selectedWorkspaceRoot ||
          normalizeDirectoryPath(matchingSession.directory ?? "") === selectedWorkspaceRoot
        : false;

      if (
        args.sessionsLoaded() &&
        !pendingInitialSelection &&
        shouldRedirectMissingSessionAfterScopedLoad({
          loadedScopeRoot: args.loadedSessionScopeRoot(),
          workspaceRoot: args.selectedWorkspaceRoot().trim(),
          hasMatchingSession: hasMatchingSessionInScope,
        })
      ) {
        if (args.selectedSessionId() === id) {
          args.setSelectedSessionId(null);
        }
        args.navigate("/session", { replace: true });
        return;
      }

      if (args.selectedSessionId() !== id) {
        args.setSelectedSessionId(id);
        void args.selectSession(id);
      }
      return;
    }

    const fallback = args.activeSessionId();
    if (fallback) {
      args.goToSession(fallback, { replace: true });
      return;
    }
    args.navigate("/session", { replace: true });
  });
}
