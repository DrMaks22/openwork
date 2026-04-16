/** @jsxImportSource react */
import { t } from "../../../../i18n";

type RecoverySettingsProps = {
  workspaceConfigPath: string | null;
  showDesktopActions: boolean;
  revealConfigBusy: boolean;
  onRevealWorkspaceConfig: () => void | Promise<void>;
  resetConfigBusy: boolean;
  onResetAppConfigDefaults: () => void | Promise<void>;
  anyActiveRuns: boolean;
  configActionStatus: string | null;
  cacheRepairBusy: boolean;
  cacheRepairResult: string | null;
  onRepairOpencodeCache: () => void;
  dockerCleanupBusy: boolean;
  dockerCleanupResult: string | null;
  onCleanupDockerContainers: () => void;
};

const panelClass =
  "bg-gray-2/30 border border-gray-6/50 rounded-2xl p-4";

function outlineButtonClass() {
  return "inline-flex h-8 items-center justify-center rounded-md border border-gray-6 bg-transparent px-3 py-0 text-xs font-medium text-gray-11 transition-colors hover:bg-gray-2/70 disabled:cursor-not-allowed disabled:opacity-60";
}

function dangerButtonClass() {
  return "inline-flex h-8 items-center justify-center rounded-md border border-red-7/40 bg-red-3/15 px-3 py-0 text-xs font-medium text-red-11 transition-colors hover:bg-red-3/25 disabled:cursor-not-allowed disabled:opacity-60";
}

function secondaryButtonClass() {
  return "inline-flex h-8 items-center justify-center rounded-md bg-gray-12 px-3 py-0 text-xs font-medium text-gray-1 transition-colors hover:bg-gray-11 disabled:cursor-not-allowed disabled:opacity-60";
}

export function RecoverySettings(props: RecoverySettingsProps) {
  const workspaceConfigPath =
    props.workspaceConfigPath || t("settings.no_active_workspace");

  return (
    <div className="space-y-6">
      <div className={`${panelClass} space-y-3`}>
        <div className="text-sm font-medium text-gray-12">
          {t("settings.workspace_config_title")}
        </div>
        <div className="text-xs text-gray-10">
          {t("settings.workspace_config_desc")}
        </div>
        <div className="break-all font-mono text-[11px] text-gray-7">
          {workspaceConfigPath}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={outlineButtonClass()}
            onClick={props.onRevealWorkspaceConfig}
            disabled={
              !props.showDesktopActions ||
              props.revealConfigBusy ||
              !props.workspaceConfigPath
            }
            title={
              !props.showDesktopActions
                ? t("settings.reveal_config_requires_desktop")
                : ""
            }
          >
            {props.revealConfigBusy
              ? t("settings.opening")
              : t("settings.reveal_config")}
          </button>
          <button
            type="button"
            className={dangerButtonClass()}
            onClick={props.onResetAppConfigDefaults}
            disabled={props.resetConfigBusy || props.anyActiveRuns}
            title={
              props.anyActiveRuns
                ? t("settings.stop_runs_before_reset_config")
                : ""
            }
          >
            {props.resetConfigBusy
              ? t("settings.resetting")
              : t("settings.reset_config_defaults")}
          </button>
        </div>
        {props.configActionStatus ? (
          <div className="text-xs text-gray-10">{props.configActionStatus}</div>
        ) : null}
      </div>

      <div className={`${panelClass} flex flex-col gap-4 md:flex-row md:items-center md:justify-between`}>
        <div className="min-w-0">
          <div className="text-sm text-gray-12">
            {t("settings.opencode_cache")}
          </div>
          <div className="text-xs text-gray-7">
            {t("settings.opencode_cache_description")}
          </div>
          {props.cacheRepairResult ? (
            <div className="mt-2 text-xs text-gray-11">
              {props.cacheRepairResult}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className={secondaryButtonClass()}
          onClick={props.onRepairOpencodeCache}
          disabled={props.cacheRepairBusy || !props.showDesktopActions}
          title={
            props.showDesktopActions
              ? ""
              : t("settings.cache_repair_requires_desktop")
          }
        >
          {props.cacheRepairBusy
            ? t("settings.repairing_cache")
            : t("settings.repair_cache")}
        </button>
      </div>

      <div className={`${panelClass} flex flex-col gap-4 md:flex-row md:items-center md:justify-between`}>
        <div className="min-w-0">
          <div className="text-sm text-gray-12">
            {t("settings.docker_containers_title")}
          </div>
          <div className="text-xs text-gray-7">
            {t("settings.docker_containers_desc")}
          </div>
          {props.dockerCleanupResult ? (
            <div className="mt-2 text-xs text-gray-11">
              {props.dockerCleanupResult}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className={dangerButtonClass()}
          onClick={props.onCleanupDockerContainers}
          disabled={
            props.dockerCleanupBusy ||
            props.anyActiveRuns ||
            !props.showDesktopActions
          }
          title={
            !props.showDesktopActions
              ? t("settings.docker_requires_desktop")
              : props.anyActiveRuns
                ? t("settings.stop_runs_before_cleanup")
                : ""
          }
        >
          {props.dockerCleanupBusy
            ? t("settings.removing_containers")
            : t("settings.delete_containers")}
        </button>
      </div>
    </div>
  );
}

export default RecoverySettings;
