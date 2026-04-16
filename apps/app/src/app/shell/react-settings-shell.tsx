import { createElement } from "react";

export type ReactSettingsShellProps = {
  title: string;
  workspaceLabel: string;
  developerMode: boolean;
  headerStatus: string;
  busyHint: string | null;
  showUpdatePill: boolean;
  updatePillLabel: string;
  updatePillTitle: string;
  updateVersion?: string | null;
  onUpdatePillClick: () => void;
  onClose: () => void;
  closeLabel: string;
};

export default function ReactSettingsShell(props: ReactSettingsShellProps) {
  const updatePill = props.showUpdatePill
    ? createElement(
        "button",
        {
          type: "button",
          className:
            "md:hidden flex items-center gap-1.5 rounded-full border border-dls-border bg-dls-surface px-2.5 py-1 text-xs font-medium shadow-sm transition-colors",
          onClick: props.onUpdatePillClick,
          title: props.updatePillTitle,
          "aria-label": props.updatePillTitle,
        },
        createElement("span", { className: "text-[11px]" }, props.updatePillLabel),
        props.updateVersion
          ? createElement(
              "span",
              {
                className: "hidden sm:inline font-mono text-[10px] text-dls-secondary",
              },
              `v${props.updateVersion}`,
            )
          : null,
      )
    : null;

  return createElement(
    "header",
    {
      className:
        "sticky top-0 z-10 flex h-12 items-center justify-between border-b border-dls-border bg-dls-surface px-4 md:px-6",
    },
    createElement(
      "div",
      {
        className: "flex min-w-0 items-center gap-3",
      },
      updatePill,
      createElement(
        "div",
        {
          className: "truncate text-[15px] font-semibold text-dls-text",
        },
        props.title,
      ),
      createElement(
        "div",
        {
          className: "hidden truncate text-[13px] text-dls-secondary lg:block",
        },
        props.workspaceLabel,
      ),
      props.developerMode
        ? createElement(
            "div",
            {
              className: "hidden truncate text-[12px] text-dls-secondary lg:block",
            },
            props.headerStatus,
          )
        : null,
      props.busyHint
        ? createElement(
            "div",
            {
              className: "hidden truncate text-[12px] text-dls-secondary lg:block",
            },
            props.busyHint,
          )
        : null,
    ),
    createElement(
      "div",
      { className: "flex items-center text-gray-10" },
      createElement(
        "button",
        {
          type: "button",
          className:
            "flex h-9 items-center justify-center rounded-md px-3 text-sm text-gray-10 transition-colors hover:bg-gray-2/70 hover:text-dls-text",
          onClick: props.onClose,
          title: props.closeLabel,
          "aria-label": props.closeLabel,
        },
        props.closeLabel,
      ),
    ),
  );
}
