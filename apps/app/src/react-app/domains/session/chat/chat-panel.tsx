import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Bot,
  CircleAlert,
  PauseCircle,
  Plus,
  Save,
  ShieldAlert,
  Sparkles,
  Trash2,
} from "lucide-react";

import type { MessageWithParts, PendingQuestion, TodoItem } from "../../../../app/types";
import { deriveArtifacts, deriveWorkingFiles, formatRelativeTime, isVisibleTextPart } from "../../../../app/utils";
import {
  selectActiveWorkspace,
  selectSelectedHasEarlierMessages,
  selectSelectedLoadingEarlierMessages,
  selectSelectedSession,
  useOpenworkStore,
} from "../../../kernel/store";
import { QuestionSheet } from "./question-sheet";
import { SessionSurfaceAdapter } from "./session-surface-adapter";

const EMPTY_MESSAGES: MessageWithParts[] = [];
const EMPTY_TODOS: TodoItem[] = [];

function messagePreview(message: MessageWithParts) {
  return message.parts
    .filter(isVisibleTextPart)
    .map((part) => String((part as { text?: string }).text ?? ""))
    .join(" ")
    .trim();
}

function deriveSessionHeading(sessionId: string | null, messages: MessageWithParts[], explicitTitle?: string | null) {
  if (explicitTitle?.trim()) return explicitTitle.trim();
  if (!sessionId) return "Fresh task";
  const firstUser = messages.find((message) => message.info.role === "user");
  const preview = firstUser ? messagePreview(firstUser) : "";
  return preview ? preview.slice(0, 84) : `Task ${sessionId.slice(0, 8)}`;
}

function permissionLabel(permission: Record<string, unknown>) {
  if (typeof permission.message === "string" && permission.message.trim()) return permission.message;
  if (typeof permission.tool === "string" && permission.tool.trim()) return permission.tool;
  return String(permission.id ?? "Permission request");
}

export function ChatPanel() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const activeWorkspace = useOpenworkStore(selectActiveWorkspace);
  const selectedSession = useOpenworkStore(selectSelectedSession);
  const selectedSessionId = useOpenworkStore((state) => state.selectedSessionId);
  const messagesBySessionId = useOpenworkStore((state) => state.messagesBySessionId);
  const todosBySessionId = useOpenworkStore((state) => state.todosBySessionId);
  const sessionStatusById = useOpenworkStore((state) => state.sessionStatusById);
  const pendingPermissions = useOpenworkStore((state) => state.pendingPermissions);
  const pendingQuestions = useOpenworkStore((state) => state.pendingQuestions);
  const hasEarlierMessages = useOpenworkStore(selectSelectedHasEarlierMessages);
  const loadingEarlierMessages = useOpenworkStore(selectSelectedLoadingEarlierMessages);
  const errorBanner = useOpenworkStore((state) => state.errorBanner);
  const server = useOpenworkStore((state) => state.server);
  const clearErrorBanner = useOpenworkStore((state) => state.clearErrorBanner);
  const createSession = useOpenworkStore((state) => state.createSession);
  const selectSession = useOpenworkStore((state) => state.selectSession);
  const deleteSession = useOpenworkStore((state) => state.deleteSession);
  const replyPermission = useOpenworkStore((state) => state.replyPermission);
  const replyQuestion = useOpenworkStore((state) => state.replyQuestion);
  const rejectQuestion = useOpenworkStore((state) => state.rejectQuestion);
  const abortSession = useOpenworkStore((state) => state.abortSession);
  const renameSession = useOpenworkStore((state) => state.renameSession);
  const loadEarlierMessages = useOpenworkStore((state) => state.loadEarlierMessages);
  const setCreateWorkspaceOpen = useOpenworkStore((state) => state.setCreateWorkspaceOpen);

  const [titleDraft, setTitleDraft] = useState("");
  const [questionBusy, setQuestionBusy] = useState(false);

  const messages = useMemo(
    () => (selectedSessionId ? messagesBySessionId[selectedSessionId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES),
    [messagesBySessionId, selectedSessionId],
  );
  const todos = useMemo(
    () => (selectedSessionId ? todosBySessionId[selectedSessionId] ?? EMPTY_TODOS : EMPTY_TODOS),
    [selectedSessionId, todosBySessionId],
  );
  const status = selectedSessionId ? sessionStatusById[selectedSessionId] ?? "idle" : "idle";
  const permissions = useMemo(
    () => (selectedSessionId ? pendingPermissions.filter((item) => item.sessionID === selectedSessionId) : pendingPermissions),
    [pendingPermissions, selectedSessionId],
  );
  const scopedQuestions = useMemo(
    () => (selectedSessionId ? pendingQuestions.filter((item) => item.sessionID === selectedSessionId) : pendingQuestions),
    [pendingQuestions, selectedSessionId],
  );
  const activeQuestion = scopedQuestions[0] ?? null;

  useEffect(() => {
    if (sessionId && sessionId !== selectedSession?.id) {
      void selectSession(sessionId);
      return;
    }
    if (!sessionId && selectedSession?.id) {
      navigate(`/session/${selectedSession.id}`, { replace: true });
    }
  }, [navigate, selectSession, selectedSession?.id, sessionId]);

  useEffect(() => {
    setTitleDraft(deriveSessionHeading(selectedSession?.id ?? sessionId ?? null, messages, selectedSession?.title ?? null));
  }, [messages, selectedSession?.id, selectedSession?.title, sessionId]);

  const headerTitle = deriveSessionHeading(selectedSession?.id ?? sessionId ?? null, messages, selectedSession?.title ?? null);
  const artifacts = useMemo(() => deriveArtifacts(messages, { maxMessages: 200 }), [messages]);
  const workingFiles = useMemo(() => deriveWorkingFiles(artifacts), [artifacts]);
  const statusTone = status === "running" ? "Streaming" : status === "retry" ? "Retrying" : "Idle";
  const canRename = Boolean(selectedSession?.id && titleDraft.trim().length > 0 && titleDraft.trim() !== (selectedSession.title?.trim() || headerTitle));

  const emptyState = useMemo(() => {
    if (!activeWorkspace) {
      return {
        title: "Create or connect a workspace",
        body: "Start with a native workspace on this device, or connect to an existing remote worker and open a session from there.",
        actionLabel: "Add workspace",
        href: null,
      };
    }
    if (!selectedSession) {
      return {
        title: "Start a real task",
        body: "Create a session to unlock transcript search, working files, todo tracking, streamed markdown, and question/permission handling in the new shell.",
        actionLabel: "Create task",
        href: null,
      };
    }
    return null;
  }, [activeWorkspace, selectedSession]);

  const handleCreateSession = async () => {
    const next = await createSession();
    if (next) {
      navigate(`/session/${next}`);
    }
  };

  const handleRename = async () => {
    if (!selectedSession?.id || !canRename) return;
    await renameSession(selectedSession.id, titleDraft.trim());
  };

  const handleReplyQuestion = async (answers: string[][]) => {
    if (!activeQuestion) return;
    setQuestionBusy(true);
    try {
      await replyQuestion(activeQuestion.id, answers);
    } finally {
      setQuestionBusy(false);
    }
  };

  const handleRejectQuestion = async () => {
    if (!activeQuestion) return;
    setQuestionBusy(true);
    try {
      await rejectQuestion(activeQuestion.id);
    } finally {
      setQuestionBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="ow-soft-shell px-5 py-5 lg:px-6 lg:py-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="ow-kicker">
              <Sparkles className="h-3.5 w-3.5" />
              Session
            </div>
            <div className="space-y-3">
              <input
                className="ow-title-input"
                id="openwork-session-title"
                name="openworkSessionTitle"
                onChange={(event) => setTitleDraft(event.target.value)}
                placeholder="Name this task"
                value={titleDraft}
              />
              <p className="max-w-3xl text-sm leading-7 text-slate-600">
                Review the transcript, keep context visible, and continue work in the current workspace.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span className={status === "running" ? "ow-status-pill ow-status-pill-warning" : "ow-status-pill ow-status-pill-neutral"}>{statusTone}</span>
              {selectedSession?.time?.updated ? <span>Updated {formatRelativeTime(selectedSession.time.updated)}</span> : null}
              {activeWorkspace ? <span>Scope: {activeWorkspace.displayName || activeWorkspace.name}</span> : null}
              {messages.length ? <span>{messages.length} transcript entries</span> : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            <button className="ow-button-primary" onClick={() => void handleCreateSession()} type="button">
              <Plus className="h-4 w-4" />
              New task
            </button>
            <button
              className="ow-button-secondary"
              onClick={() => navigate("/settings?tab=general")}
              type="button"
            >
              Settings
            </button>
            <button className="ow-button-secondary" disabled={!canRename} onClick={() => void handleRename()} type="button">
              <Save className="h-4 w-4" />
              Save title
            </button>
            {status === "running" || status === "retry" ? (
              <button className="ow-button-secondary" onClick={() => void abortSession(selectedSession?.id)} type="button">
                <PauseCircle className="h-4 w-4" />
                Stop
              </button>
            ) : null}
            {selectedSession ? (
              <button className="ow-button-secondary" onClick={() => void deleteSession(selectedSession.id)} type="button">
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {errorBanner ? (
        <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <CircleAlert className="mt-0.5 h-4 w-4 flex-none" />
              <span>{errorBanner}</span>
            </div>
            <button className="text-rose-500 transition hover:text-rose-700" onClick={clearErrorBanner} type="button">
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {permissions.length ? (
        <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
          <div className="mb-3 flex items-center gap-2 font-medium">
            <ShieldAlert className="h-4 w-4" />
            Pending permissions
          </div>
          <div className="space-y-3">
            {permissions.map((permission) => (
              <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-white px-4 py-4 lg:flex-row lg:items-center lg:justify-between" key={permission.id}>
                <div>
                  <div className="font-medium text-slate-900">{permissionLabel(permission as Record<string, unknown>)}</div>
                  <div className="mt-1 text-sm leading-6 text-slate-600">{permission.tool ? `Tool: ${permission.tool}` : permission.id}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="ow-button-secondary" onClick={() => void replyPermission(permission.id, "once")} type="button">
                    Allow once
                  </button>
                  <button className="ow-button-secondary" onClick={() => void replyPermission(permission.id, "always")} type="button">
                    Always allow
                  </button>
                  <button className="ow-button-secondary" onClick={() => void replyPermission(permission.id, "reject")} type="button">
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="ow-soft-shell overflow-hidden">
        {emptyState ? (
          <div className="flex min-h-[32rem] flex-col items-center justify-center gap-5 px-8 py-12 text-center">
            <div className="ow-icon-tile h-14 w-14 rounded-full text-slate-700">
              <Bot className="h-7 w-7" />
            </div>
            <div className="space-y-3">
              <h2 className="text-2xl font-semibold text-slate-900">{emptyState.title}</h2>
              <p className="max-w-xl text-sm leading-7 text-slate-600">{emptyState.body}</p>
            </div>
            {emptyState.href ? (
              <Link className="ow-button-primary" to={emptyState.href}>
                {emptyState.actionLabel}
              </Link>
            ) : (
              <button
                className="ow-button-primary"
                onClick={() => {
                  if (!activeWorkspace) {
                    setCreateWorkspaceOpen(true);
                    return;
                  }
                  void handleCreateSession();
                }}
                type="button"
              >
                {emptyState.actionLabel}
              </button>
            )}
          </div>
        ) : (
          activeWorkspace && selectedSession?.id ? (
            <SessionSurfaceAdapter
              hasEarlierMessages={hasEarlierMessages}
              loadingEarlierMessages={loadingEarlierMessages}
              onLoadEarlierMessages={() => loadEarlierMessages(selectedSession.id)}
              onOpenSettingsTab={(tab) => navigate(`/settings?tab=${tab}`)}
              serverStatus={server.status}
              serverToken={server.token}
              serverUrl={server.url}
              sessionId={selectedSession.id}
              workingFiles={workingFiles}
              workspace={activeWorkspace}
            />
          ) : null
        )}
      </div>

      {todos.length ? (
        <div className="ow-soft-card px-4 py-4">
          <div className="ow-kicker">Task progress</div>
          <div className="mt-4 space-y-3">
            {todos.map((todo, index) => (
              <div
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                key={todo.id}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-slate-900">
                    {index + 1}. {todo.content}
                  </span>
                  <span className="ow-status-pill ow-status-pill-neutral">
                    {todo.status}
                  </span>
                </div>
                <div className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Priority {todo.priority}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <QuestionSheet busy={questionBusy} onReject={handleRejectQuestion} onReply={handleReplyQuestion} question={activeQuestion as PendingQuestion | null} />
    </section>
  );
}
