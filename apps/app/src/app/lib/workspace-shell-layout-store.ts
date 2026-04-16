const LEFT_SIDEBAR_WIDTH_KEY = "openwork.workspace-shell.left-width.v1";
const RIGHT_SIDEBAR_EXPANDED_KEY = "openwork.workspace-shell.right-expanded.v3";

export const DEFAULT_WORKSPACE_LEFT_SIDEBAR_WIDTH = 260;
export const MIN_WORKSPACE_LEFT_SIDEBAR_WIDTH = 220;
export const MAX_WORKSPACE_LEFT_SIDEBAR_WIDTH = 420;
export const DEFAULT_WORKSPACE_RIGHT_SIDEBAR_COLLAPSED_WIDTH = 72;

export type WorkspaceShellLayoutOptions = {
  defaultLeftWidth?: number;
  minLeftWidth?: number;
  maxLeftWidth?: number;
  collapsedRightWidth?: number;
  expandedRightWidth: number;
};

export type WorkspaceShellLayoutSnapshot = {
  leftSidebarWidth: number;
  rightSidebarExpanded: boolean;
  collapsedRightWidth: number;
  expandedRightWidth: number;
  minLeftWidth: number;
  maxLeftWidth: number;
};

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore persistence failures
  }
}

export function clampWorkspaceShellLeftWidth(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readLeftSidebarWidth(defaultLeftWidth: number, minLeftWidth: number, maxLeftWidth: number) {
  const raw = readStorage(LEFT_SIDEBAR_WIDTH_KEY);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return defaultLeftWidth;
  return clampWorkspaceShellLeftWidth(parsed, minLeftWidth, maxLeftWidth);
}

function readRightSidebarExpanded() {
  const raw = readStorage(RIGHT_SIDEBAR_EXPANDED_KEY);
  if (raw == null) return false;
  return raw === "1";
}

export function createWorkspaceShellLayoutStore(options: WorkspaceShellLayoutOptions) {
  const minLeftWidth = Math.max(180, options.minLeftWidth ?? MIN_WORKSPACE_LEFT_SIDEBAR_WIDTH);
  const maxLeftWidth = Math.max(minLeftWidth, options.maxLeftWidth ?? MAX_WORKSPACE_LEFT_SIDEBAR_WIDTH);
  const defaultLeftWidth = clampWorkspaceShellLeftWidth(
    options.defaultLeftWidth ?? DEFAULT_WORKSPACE_LEFT_SIDEBAR_WIDTH,
    minLeftWidth,
    maxLeftWidth,
  );
  const collapsedRightWidth = Math.max(
    56,
    options.collapsedRightWidth ?? DEFAULT_WORKSPACE_RIGHT_SIDEBAR_COLLAPSED_WIDTH,
  );
  const expandedRightWidth = Math.max(collapsedRightWidth, options.expandedRightWidth);

  let snapshot: WorkspaceShellLayoutSnapshot = {
    leftSidebarWidth: readLeftSidebarWidth(defaultLeftWidth, minLeftWidth, maxLeftWidth),
    rightSidebarExpanded: readRightSidebarExpanded(),
    collapsedRightWidth,
    expandedRightWidth,
    minLeftWidth,
    maxLeftWidth,
  };

  const listeners = new Set<(next: WorkspaceShellLayoutSnapshot) => void>();

  const emit = () => {
    for (const listener of listeners) {
      listener(snapshot);
    }
  };

  const setLeftSidebarWidth = (value: number) => {
    const nextWidth = clampWorkspaceShellLeftWidth(value, minLeftWidth, maxLeftWidth);
    if (snapshot.leftSidebarWidth === nextWidth) return;
    snapshot = { ...snapshot, leftSidebarWidth: nextWidth };
    writeStorage(LEFT_SIDEBAR_WIDTH_KEY, String(nextWidth));
    emit();
  };

  const setRightSidebarExpanded = (value: boolean) => {
    if (snapshot.rightSidebarExpanded === value) return;
    snapshot = { ...snapshot, rightSidebarExpanded: value };
    writeStorage(RIGHT_SIDEBAR_EXPANDED_KEY, value ? "1" : "0");
    emit();
  };

  return {
    getSnapshot() {
      return snapshot;
    },
    subscribe(listener: (next: WorkspaceShellLayoutSnapshot) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setLeftSidebarWidth,
    setRightSidebarExpanded,
    toggleRightSidebar() {
      setRightSidebarExpanded(!snapshot.rightSidebarExpanded);
    },
  };
}
