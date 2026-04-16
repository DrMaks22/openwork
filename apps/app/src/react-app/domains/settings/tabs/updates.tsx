/** @jsxImportSource react */
import { formatBytes, formatRelativeTime } from "../../../../app/utils";
import { t } from "../../../../i18n";

type UpdatesSettingsProps = {
  busy: boolean;
  webDeployment: boolean;
  appVersion: string | null;
  updateAutoCheck: boolean;
  onToggleUpdateAutoCheck: () => void;
  updateAutoDownload: boolean;
  onToggleUpdateAutoDownload: () => void;
  updateStatus: {
    state: string;
    lastCheckedAt?: number | null;
    version?: string;
    date?: string;
    notes?: string;
    totalBytes?: number | null;
    downloadedBytes?: number;
    message?: string;
  } | null;
  updateEnv: { supported?: boolean; reason?: string | null } | null;
  onCheckForUpdates: () => void;
  onDownloadUpdate: () => void;
  onInstallUpdateAndRestart: () => void;
  anyActiveRuns: boolean;
  updateRestartBlockedMessage: string | null;
};

const settingsPanelClass =
  "bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5";

function toggleClass(active: boolean) {
  return `min-w-[70px] rounded-full border px-4 py-1.5 text-xs font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] transition-colors ${
    active
      ? "border-gray-6/30 bg-gray-12/12 text-gray-12"
      : "border-gray-6/60 bg-gray-1/70 text-gray-10 hover:bg-gray-2/70 hover:text-gray-12"
  }`;
}

function outlineButtonClass() {
  return "inline-flex h-9 items-center justify-center rounded-full border border-gray-6/60 bg-gray-1/70 px-4 py-0 text-xs font-medium text-gray-11 transition-colors hover:bg-gray-2/70 disabled:cursor-not-allowed disabled:opacity-60";
}

function secondaryButtonClass() {
  return "inline-flex h-9 items-center justify-center rounded-full bg-gray-12 px-4 py-0 text-xs font-medium text-gray-1 transition-colors hover:bg-gray-11 disabled:cursor-not-allowed disabled:opacity-60";
}

function updateStatusLabel(status: UpdatesSettingsProps["updateStatus"]) {
  const state = status?.state ?? "idle";
  const version = status?.version ?? "";

  switch (state) {
    case "checking":
      return t("settings.update_checking");
    case "available":
      return t("settings.update_available_version", undefined, { version });
    case "downloading":
      return t("settings.update_downloading");
    case "ready":
      return t("settings.update_ready_version", undefined, { version });
    case "error":
      return t("settings.update_check_failed");
    default:
      return t("settings.update_uptodate");
  }
}

export function UpdatesSettings(props: UpdatesSettingsProps) {
  const state = props.updateStatus?.state ?? "idle";
  const lastCheckedAt = props.updateStatus?.lastCheckedAt ?? null;
  const updateVersion = props.updateStatus?.version ?? null;
  const updateDate = props.updateStatus?.date ?? null;
  const updateNotes = props.updateStatus?.notes ?? null;
  const updateTotalBytes = props.updateStatus?.totalBytes ?? null;
  const updateDownloadedBytes = props.updateStatus?.downloadedBytes ?? 0;
  const updateErrorMessage = props.updateStatus?.message ?? null;

  return (
    <div className="space-y-6">
      <div className={`${settingsPanelClass} space-y-3`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-gray-12">
              {t("settings.updates_title")}
            </div>
            <div className="text-xs text-gray-10">
              {t("settings.updates_desc")}
            </div>
          </div>
          <div className="font-mono text-xs text-gray-7">
            {props.appVersion ? `v${props.appVersion}` : ""}
          </div>
        </div>

        {props.webDeployment ? (
          <div className="rounded-xl border border-gray-6 bg-gray-1/20 p-3 text-sm text-gray-11">
            {t("settings.updates_desktop_only")}
          </div>
        ) : props.updateEnv && props.updateEnv.supported === false ? (
          <div className="rounded-xl border border-gray-6 bg-gray-1/20 p-3 text-sm text-gray-11">
            {props.updateEnv.reason ?? t("settings.updates_not_supported")}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-xl border border-gray-6 bg-gray-1 p-3">
              <div className="space-y-0.5">
                <div className="text-sm text-gray-12">
                  {t("settings.background_checks_title")}
                </div>
                <div className="text-xs text-gray-7">
                  {t("settings.background_checks_desc")}
                </div>
              </div>
              <button
                type="button"
                className={toggleClass(props.updateAutoCheck)}
                onClick={props.onToggleUpdateAutoCheck}
              >
                {props.updateAutoCheck ? t("settings.on") : t("settings.off")}
              </button>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-gray-6 bg-gray-1 p-3">
              <div className="space-y-0.5">
                <div className="text-sm text-gray-12">
                  {t("settings.auto_update_title")}
                </div>
                <div className="text-xs text-gray-7">
                  {t("settings.auto_update_desc")}
                </div>
              </div>
              <button
                type="button"
                className={toggleClass(props.updateAutoDownload)}
                onClick={props.onToggleUpdateAutoDownload}
              >
                {props.updateAutoDownload ? t("settings.on") : t("settings.off")}
              </button>
            </div>

            <div className="space-y-3 rounded-xl border border-gray-6 bg-gray-1 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-sm text-gray-12">
                    {updateStatusLabel(props.updateStatus)}
                  </div>
                  {state === "idle" && lastCheckedAt ? (
                    <div className="text-xs text-gray-7">
                      {t("settings.update_last_checked", undefined, {
                        time: formatRelativeTime(lastCheckedAt),
                      })}
                    </div>
                  ) : null}
                  {state === "available" && updateDate ? (
                    <div className="text-xs text-gray-7">
                      {t("settings.update_published", undefined, {
                        date: updateDate,
                      })}
                    </div>
                  ) : null}
                  {state === "downloading" ? (
                    <div className="text-xs text-gray-7">
                      {formatBytes(updateDownloadedBytes)}
                      {updateTotalBytes != null
                        ? ` / ${formatBytes(updateTotalBytes)}`
                        : ""}
                    </div>
                  ) : null}
                  {state === "error" && updateErrorMessage ? (
                    <div className="text-xs text-red-11">
                      {updateErrorMessage}
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={outlineButtonClass()}
                    onClick={props.onCheckForUpdates}
                    disabled={props.busy || state === "checking" || state === "downloading"}
                  >
                    {t("settings.update_check_button")}
                  </button>

                  {state === "available" ? (
                    <button
                      type="button"
                      className={secondaryButtonClass()}
                      onClick={props.onDownloadUpdate}
                      disabled={props.busy}
                    >
                      {t("settings.update_download_button")}
                    </button>
                  ) : null}

                  {state === "ready" ? (
                    <button
                      type="button"
                      className={secondaryButtonClass()}
                      onClick={props.onInstallUpdateAndRestart}
                      disabled={props.busy || props.anyActiveRuns}
                      title={props.updateRestartBlockedMessage ?? ""}
                    >
                      {t("settings.update_install_button")}
                    </button>
                  ) : null}
                </div>
              </div>

              {props.updateRestartBlockedMessage ? (
                <div className="rounded-xl border border-amber-7/25 bg-amber-3/10 px-3 py-2 text-xs leading-relaxed text-amber-11">
                  {props.updateRestartBlockedMessage}
                </div>
              ) : null}
            </div>

            {state === "available" && updateNotes ? (
              <div className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl border border-gray-6 bg-gray-1/20 p-3 text-xs text-gray-11">
                {updateNotes}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export default UpdatesSettings;
