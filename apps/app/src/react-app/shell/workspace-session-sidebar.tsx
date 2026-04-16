import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  LoaderCircle,
  Plus,
  RefreshCw,
  Server,
  Trash2,
} from "lucide-react";

import { formatRelativeTime } from "../../app/utils";
import {
  selectActiveWorkspace,
  selectServerHostLabel,
  selectWorkspaceScopeLabel,
  useOpenworkStore,
} from "../kernel/store";

import {
  MAX_ROOT_SESSIONS,
  buildSessionTreeState,
  flattenSessionRows,
  getRootSessions,
  workspaceSwatchColor,
  type SidebarSession,
} from "./session-tree";

export function WorkspaceSessionSidebar() {
  const navigate = useNavigate();
  const server = useOpenworkStore((state) => state.server);
  const workspaces = useOpenworkStore((state) => state.workspaces);
  const workspacesStatus = useOpenworkStore((state) => state.workspacesStatus);
  const workerProfiles = useOpenworkStore((state) => state.workerProfiles);
  const activeWorkerProfileId = useOpenworkStore(
    (state) => state.activeWorkerProfileId,
  );
  const activeWorkspace = useOpenworkStore(selectActiveWorkspace);
  const activeWorkspaceId = useOpenworkStore((state) => state.activeWorkspaceId);
  const selectedSessionId = useOpenworkStore((state) => state.selectedSessionId);
  const sessions = useOpenworkStore((state) => state.sessions) as SidebarSession[];
  const sessionsStatus = useOpenworkStore((state) => state.sessionsStatus);
  const sessionStatusById = useOpenworkStore((state) => state.sessionStatusById);
  const connectedToEvents = useOpenworkStore((state) => state.connectedToEvents);
  const serverHost = useOpenworkStore(selectServerHostLabel);
  const refreshServer = useOpenworkStore((state) => state.refreshServer);
  const refreshSessions = useOpenworkStore((state) => state.refreshSessions);
  const selectWorkspace = useOpenworkStore((state) => state.selectWorkspace);
  const connectWorkerProfile = useOpenworkStore(
    (state) => state.connectWorkerProfile,
  );
  const removeWorkerProfile = useOpenworkStore((state) => state.removeWorkerProfile);
  const setCreateWorkspaceOpen = useOpenworkStore(
    (state) => state.setCreateWorkspaceOpen,
  );
  const createSession = useOpenworkStore((state) => state.createSession);
  const deleteSession = useOpenworkStore((state) => state.deleteSession);
  const ensureSessionLoaded = useOpenworkStore((state) => state.ensureSessionLoaded);

  const [expandedWorkspaceIds, setExpandedWorkspaceIds] = useState<Set<string>>(
    new Set(),
  );
  const [expandedSessionIds, setExpandedSessionIds] = useState<Set<string>>(
    new Set(),
  );
  const [previewCountByWorkspaceId, setPreviewCountByWorkspaceId] = useState<
    Record<string, number>
  >({});

  useEffect(() => {
    if (!activeWorkspaceId) return;
    setExpandedWorkspaceIds((current) => {
      if (current.has(activeWorkspaceId)) return current;
      const next = new Set(current);
      next.add(activeWorkspaceId);
      return next;
    });
  }, [activeWorkspaceId]);

  const sessionTree = useMemo(
    () => buildSessionTreeState(sessions, sessionStatusById),
    [sessionStatusById, sessions],
  );

  const forcedExpandedSessionIds = useMemo(() => {
    if (!selectedSessionId) return new Set<string>();
    return new Set(
      sessionTree.ancestorIdsBySessionId.get(selectedSessionId) ?? [],
    );
  }, [selectedSessionId, sessionTree.ancestorIdsBySessionId]);

  const previewCount =
    previewCountByWorkspaceId[activeWorkspaceId ?? ""] ?? MAX_ROOT_SESSIONS;
  const sessionRows = useMemo(
    () =>
      flattenSessionRows(
        sessions,
        previewCount,
        sessionTree,
        expandedSessionIds,
        forcedExpandedSessionIds,
      ),
    [expandedSessionIds, forcedExpandedSessionIds, previewCount, sessionTree, sessions],
  );

  const remainingRootSessions = Math.max(
    0,
    getRootSessions(sessions).length - previewCount,
  );
  const sessionsBusy = sessionsStatus === "loading";

  const handleCreateSession = async () => {
    const next = await createSession();
    if (next) {
      navigate(`/session/${next}`);
    }
  };

  const handleWorkspaceOpen = async (workspaceId: string) => {
    setExpandedWorkspaceIds((current) => {
      const next = new Set(current);
      next.add(workspaceId);
      return next;
    });
    await selectWorkspace(workspaceId);
  };

  const toggleActiveWorkspaceExpanded = (workspaceId: string) => {
    setExpandedWorkspaceIds((current) => {
      const next = new Set(current);
      if (next.has(workspaceId)) {
        next.delete(workspaceId);
      } else {
        next.add(workspaceId);
      }
      return next;
    });
  };

  const toggleSessionExpanded = (sessionId: string) => {
    setExpandedSessionIds((current) => {
      const next = new Set(current);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  return (
    <aside className="ow-soft-shell flex h-full flex-col overflow-hidden px-3 py-3">
      <div className="border-b border-slate-100 px-1 pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="ow-kicker">Workspace</div>
            <div className="mt-2 text-lg font-semibold text-slate-900">
              Project navigator
            </div>
          </div>
          <div className="flex gap-2">
            <button
              className="ow-button-secondary h-11 px-3"
              onClick={() => setCreateWorkspaceOpen(true)}
              type="button"
            >
              <FolderPlus className="h-4 w-4" />
            </button>
            <button
              className="ow-button-secondary h-11 px-3"
              onClick={() => void refreshServer()}
              type="button"
            >
              {server.status === "connecting" ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
          <div className="flex items-center gap-2 font-medium text-slate-900">
            <Server className="h-4 w-4 text-slate-700" />
            {serverHost}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            <span
              className={
                server.status === "connected"
                  ? "ow-status-pill ow-status-pill-positive"
                  : "ow-status-pill ow-status-pill-neutral"
              }
            >
              {server.status}
            </span>
            <span className="ow-status-pill ow-status-pill-neutral">
              {connectedToEvents ? "events live" : "events pending"}
            </span>
            <span className="ow-status-pill ow-status-pill-neutral">
              {workspacesStatus}
            </span>
          </div>
        </div>
      </div>

      <div className="ow-scroller flex-1 space-y-4 px-1 py-3">
        {workerProfiles.length ? (
          <div className="space-y-2">
            <div className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Saved remote workers
            </div>
            {workerProfiles.map((profile) => {
              const activeProfile = profile.id === activeWorkerProfileId;
              return (
                <div
                  className={
                    activeProfile
                      ? "ow-worker-item ow-worker-item-active"
                      : "ow-worker-item"
                  }
                  key={profile.id}
                >
                  <button
                    className="w-full text-left"
                    onClick={() => void connectWorkerProfile(profile.id)}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-900">
                          {profile.displayName}
                        </div>
                        <div className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          {profile.source}
                        </div>
                      </div>
                      <span className="ow-status-pill ow-status-pill-neutral">
                        remote
                      </span>
                    </div>
                    <div className="mt-3 line-clamp-2 text-sm leading-6 text-slate-500">
                      {profile.hostUrl}
                    </div>
                  </button>
                  <div className="mt-3 flex justify-end">
                    <button
                      className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-rose-600"
                      onClick={() => removeWorkerProfile(profile.id)}
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Workspaces
          </div>
          {workspaces.length ? (
            workspaces.map((workspace) => {
              const active = workspace.id === activeWorkspace?.id;
              const expanded = expandedWorkspaceIds.has(workspace.id);
              const showSessions = active && expanded;

              return (
                <div
                  className={
                    active
                      ? "ow-session-item ow-session-item-active text-left"
                      : "ow-session-item text-left"
                  }
                  key={workspace.id}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="mt-1 h-3 w-3 shrink-0 rounded-full"
                      style={{
                        backgroundColor: workspaceSwatchColor(
                          workspace.path || workspace.id,
                        ),
                      }}
                    />
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => void handleWorkspaceOpen(workspace.id)}
                      type="button"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-900">
                            {workspace.displayName || workspace.name}
                          </div>
                          <div className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                            {workspace.workspaceType}
                          </div>
                        </div>
                        <span className="ow-status-pill ow-status-pill-neutral">
                          {active ? "active" : "ready"}
                        </span>
                      </div>
                      <div className="mt-3 line-clamp-2 text-sm leading-6 text-slate-500">
                        {selectWorkspaceScopeLabel(workspace)}
                      </div>
                    </button>
                    {active ? (
                      <button
                        className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                        onClick={() => toggleActiveWorkspaceExpanded(workspace.id)}
                        type="button"
                      >
                        {expanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    ) : null}
                  </div>

                  {showSessions ? (
                    <div className="mt-4 space-y-2 border-t border-slate-200 pt-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Task history
                        </div>
                        <div className="flex gap-2">
                          <button
                            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                            onClick={() => void refreshSessions(workspace.id)}
                            type="button"
                          >
                            {sessionsBusy ? (
                              <LoaderCircle className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                            onClick={() => void handleCreateSession()}
                            type="button"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {sessionRows.length ? (
                        <div className="space-y-2">
                          {sessionRows.map((row) => {
                            const hasChildren =
                              (sessionTree.descendantCountBySessionId.get(
                                row.session.id,
                              ) ?? 0) > 0;
                            const expandedSession =
                              expandedSessionIds.has(row.session.id) ||
                              forcedExpandedSessionIds.has(row.session.id);
                            const activeSession = row.session.id === selectedSessionId;
                            const sessionStatus =
                              sessionStatusById[row.session.id] ??
                              (sessionTree.activeIds.has(row.session.id)
                                ? "running"
                                : "idle");
                            const lastUpdated =
                              row.session.time?.updated ??
                              row.session.time?.created ??
                              null;

                            return (
                              <div
                                className={
                                  activeSession
                                    ? "ow-session-item ow-session-item-active"
                                    : "ow-session-item"
                                }
                                key={row.session.id}
                                style={{
                                  marginLeft: row.depth ? `${row.depth * 14}px` : undefined,
                                }}
                              >
                                <div className="flex items-start gap-2">
                                  {hasChildren ? (
                                    <button
                                      className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                                      onClick={() => toggleSessionExpanded(row.session.id)}
                                      type="button"
                                    >
                                      {expandedSession ? (
                                        <ChevronDown className="h-4 w-4" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4" />
                                      )}
                                    </button>
                                  ) : (
                                    <div className="h-6 w-6 shrink-0" />
                                  )}

                                  <button
                                    className="min-w-0 flex-1 text-left"
                                    onClick={() => navigate(`/session/${row.session.id}`)}
                                    onFocus={() => void ensureSessionLoaded(row.session.id)}
                                    onMouseEnter={() =>
                                      void ensureSessionLoaded(row.session.id)
                                    }
                                    type="button"
                                  >
                                    <div className="truncate text-sm font-medium text-slate-900">
                                      {row.session.title?.trim() ||
                                        `Task ${row.session.id.slice(0, 8)}`}
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                      <span>{sessionStatus}</span>
                                      {lastUpdated ? (
                                        <span>{formatRelativeTime(lastUpdated)}</span>
                                      ) : null}
                                      {hasChildren ? (
                                        <span>
                                          {sessionTree.descendantCountBySessionId.get(
                                            row.session.id,
                                          )}{" "}
                                          replies
                                        </span>
                                      ) : null}
                                    </div>
                                  </button>

                                  <button
                                    className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-rose-600"
                                    onClick={() => void deleteSession(row.session.id)}
                                    type="button"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}

                          {remainingRootSessions > 0 ? (
                            <button
                              className="w-full rounded-2xl border border-dashed border-slate-200 px-3 py-3 text-left text-sm text-slate-500 transition hover:border-slate-300 hover:bg-slate-50"
                              onClick={() =>
                                setPreviewCountByWorkspaceId((current) => ({
                                  ...current,
                                  [workspace.id]:
                                    (current[workspace.id] ?? MAX_ROOT_SESSIONS) +
                                    MAX_ROOT_SESSIONS,
                                }))
                              }
                              type="button"
                            >
                              Show {Math.min(MAX_ROOT_SESSIONS, remainingRootSessions)}{" "}
                              more tasks
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm leading-6 text-slate-500">
                          {sessionsBusy
                            ? "Loading tasks for this workspace..."
                            : "No tasks yet. Create one to start building history here."}
                        </div>
                      )}
                    </div>
                  ) : active ? null : (
                    <div className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Select to load tasks
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm leading-6 text-slate-500">
              Add a workspace to start locally, or connect a remote worker.
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-slate-100 px-1 pt-3">
        <button
          className="ow-button-primary w-full justify-center"
          onClick={() => setCreateWorkspaceOpen(true)}
          type="button"
        >
          <FolderPlus className="h-4 w-4" />
          Add workspace
        </button>
      </div>
    </aside>
  );
}
