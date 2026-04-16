import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createEffect, onCleanup } from "solid-js";

import ReactSettingsSidebarShell, {
  type ReactSettingsSidebarShellProps,
} from "./react-settings-sidebar-shell";

export default function ReactSettingsSidebarShellHost(
  props: ReactSettingsSidebarShellProps,
) {
  let container: HTMLDivElement | undefined;
  let root: Root | undefined;

  createEffect(() => {
    const snapshot: ReactSettingsSidebarShellProps = {
      leftSidebarWidth: props.leftSidebarWidth,
      showUpdatePill: props.showUpdatePill,
      updatePillLabel: props.updatePillLabel,
      updatePillTitle: props.updatePillTitle,
      updateVersion: props.updateVersion,
      onUpdatePillClick: props.onUpdatePillClick,
      onStartResize: props.onStartResize,
      renderSidebar: props.renderSidebar,
    };

    if (!container) return;
    if (!root) {
      root = createRoot(container);
    }

    root.render(createElement(ReactSettingsSidebarShell, snapshot));
  });

  onCleanup(() => {
    const currentRoot = root;
    root = undefined;
    if (!currentRoot) return;
    queueMicrotask(() => {
      currentRoot.unmount();
    });
  });

  return <div ref={container} data-openwork-react-settings-sidebar="" />;
}
