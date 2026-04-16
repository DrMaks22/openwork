import { normalizeOpenworkServerUrl, type OpenworkWorkspaceInfo } from "../../app/lib/openwork-server";
import { normalizeDirectoryPath } from "../../app/utils";

import {
  EMPTY_MESSAGES,
  EMPTY_PERMISSIONS,
  EMPTY_TODOS,
  workspaceRoot,
  type OpenworkStore,
} from "./store";

export const selectActiveWorkspace = (state: OpenworkStore) =>
  state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId) ?? null;

export const selectSelectedSession = (state: OpenworkStore) =>
  state.sessions.find((session) => session.id === state.selectedSessionId) ?? null;

export const selectSelectedMessages = (state: OpenworkStore) =>
  state.selectedSessionId
    ? state.messagesBySessionId[state.selectedSessionId] ?? EMPTY_MESSAGES
    : EMPTY_MESSAGES;

export const selectSelectedTodos = (state: OpenworkStore) =>
  state.selectedSessionId
    ? state.todosBySessionId[state.selectedSessionId] ?? EMPTY_TODOS
    : EMPTY_TODOS;

export const selectSelectedHasEarlierMessages = (state: OpenworkStore) =>
  state.selectedSessionId ? !state.sessionCompleteById[state.selectedSessionId] : false;

export const selectSelectedLoadingEarlierMessages = (state: OpenworkStore) =>
  state.selectedSessionId
    ? Boolean(state.loadingMoreBySessionId[state.selectedSessionId])
    : false;

export const selectSelectedStatus = (state: OpenworkStore) =>
  state.selectedSessionId ? state.sessionStatusById[state.selectedSessionId] ?? "idle" : "idle";

export const selectScopedPermissions = (state: OpenworkStore) => {
  const sessionId = state.selectedSessionId;
  if (!sessionId) {
    return state.pendingPermissions.length ? state.pendingPermissions : EMPTY_PERMISSIONS;
  }
  const scoped = state.pendingPermissions.filter((item) => item.sessionID === sessionId);
  return scoped.length ? scoped : EMPTY_PERMISSIONS;
};

export const selectScopedQuestions = (state: OpenworkStore) => {
  const sessionId = state.selectedSessionId;
  if (!sessionId) return state.pendingQuestions;
  return state.pendingQuestions.filter((item) => item.sessionID === sessionId);
};

export const selectServerHostLabel = (state: OpenworkStore) => {
  const value = normalizeOpenworkServerUrl(state.server.url) ?? "";
  if (!value) return "Not connected";
  try {
    const url = new URL(value);
    return url.host;
  } catch {
    return value.replace(/^https?:\/\//, "");
  }
};

export const selectWorkspaceScopeLabel = (workspace: OpenworkWorkspaceInfo | null) => {
  if (!workspace) return "No workspace selected";
  const root = workspaceRoot(workspace);
  if (!root) return workspace.workspaceType === "remote" ? "Remote workspace" : "Workspace ready";
  const normalized = normalizeDirectoryPath(root);
  return normalized || root;
};
