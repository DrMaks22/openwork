import { createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import {
  createWorkspaceShellLayoutStore,
  clampWorkspaceShellLeftWidth,
  type WorkspaceShellLayoutOptions,
} from "./workspace-shell-layout-store";

export function createWorkspaceShellLayout(options: WorkspaceShellLayoutOptions) {
  const store = createWorkspaceShellLayoutStore(options);
  const snapshot = store.getSnapshot();
  const [leftSidebarWidth, setLeftSidebarWidth] = createSignal(snapshot.leftSidebarWidth);
  const [rightSidebarExpanded, setRightSidebarExpandedState] = createSignal(
    snapshot.rightSidebarExpanded,
  );

  const rightSidebarWidth = createMemo(() =>
    rightSidebarExpanded()
      ? store.getSnapshot().expandedRightWidth
      : store.getSnapshot().collapsedRightWidth,
  );

  let dragCleanup: (() => void) | null = null;

  const stopLeftSidebarResize = () => {
    dragCleanup?.();
    dragCleanup = null;
    if (typeof document === "undefined") return;
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
  };

  const startLeftSidebarResize = (event: PointerEvent) => {
    if (event.button !== 0 || typeof window === "undefined") return;

    stopLeftSidebarResize();
    const initialX = event.clientX;
    const initialWidth = leftSidebarWidth();

    const handleMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - initialX;
      store.setLeftSidebarWidth(
        clampWorkspaceShellLeftWidth(
          initialWidth + delta,
          store.getSnapshot().minLeftWidth,
          store.getSnapshot().maxLeftWidth,
        ),
      );
    };

    const handleStop = () => {
      stopLeftSidebarResize();
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleStop);
    window.addEventListener("pointercancel", handleStop);
    dragCleanup = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleStop);
      window.removeEventListener("pointercancel", handleStop);
    };

    if (typeof document !== "undefined") {
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    event.preventDefault();
  };

  const toggleRightSidebar = () => {
    store.toggleRightSidebar();
  };

  const setRightSidebarExpanded = (value: boolean | ((current: boolean) => boolean)) => {
    const current = store.getSnapshot().rightSidebarExpanded;
    const next = typeof value === "function" ? value(current) : value;
    store.setRightSidebarExpanded(next);
  };

  onCleanup(() => {
    stopLeftSidebarResize();
  });

  createEffect(() => {
    const unsubscribe = store.subscribe((next) => {
      setLeftSidebarWidth(() => next.leftSidebarWidth);
      setRightSidebarExpandedState(() => next.rightSidebarExpanded);
    });
    onCleanup(unsubscribe);
  });

  return {
    leftSidebarWidth,
    rightSidebarExpanded,
    rightSidebarWidth,
    setRightSidebarExpanded,
    startLeftSidebarResize,
    toggleRightSidebar,
  };
}
