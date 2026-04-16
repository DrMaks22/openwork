import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createEffect, onCleanup } from "solid-js";

import ReactSettingsShell, {
  type ReactSettingsShellProps,
} from "./react-settings-shell";

export default function ReactSettingsShellHost(props: ReactSettingsShellProps) {
  let container: HTMLDivElement | undefined;
  let root: Root | undefined;

  createEffect(() => {
    const snapshot: ReactSettingsShellProps = {
      title: props.title,
      workspaceLabel: props.workspaceLabel,
      developerMode: props.developerMode,
      headerStatus: props.headerStatus,
      busyHint: props.busyHint,
      showUpdatePill: props.showUpdatePill,
      updatePillLabel: props.updatePillLabel,
      updatePillTitle: props.updatePillTitle,
      updateVersion: props.updateVersion,
      onUpdatePillClick: props.onUpdatePillClick,
      onClose: props.onClose,
      closeLabel: props.closeLabel,
    };

    if (!container) return;
    if (!root) {
      root = createRoot(container);
    }

    root.render(createElement(ReactSettingsShell, snapshot));
  });

  onCleanup(() => {
    const currentRoot = root;
    root = undefined;
    if (!currentRoot) return;
    queueMicrotask(() => {
      currentRoot.unmount();
    });
  });

  return <div ref={container} data-openwork-react-settings-shell="" />;
}
