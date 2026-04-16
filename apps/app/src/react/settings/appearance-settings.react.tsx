/** @jsxImportSource react */
import type { Language } from "../../i18n";
import { LANGUAGE_OPTIONS, t } from "../../i18n";

type AppearanceSettingsProps = {
  busy: boolean;
  themeMode: "light" | "dark" | "system";
  onThemeModeChange: (value: "light" | "dark" | "system") => void;
  language: Language;
  onLanguageChange: (value: Language) => void;
  showWindowAppearance: boolean;
  hideTitlebar: boolean;
  onToggleHideTitlebar: () => void;
};

const settingsPanelClass =
  "bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5";

const toneButtonBase =
  "inline-flex h-8 items-center justify-center rounded-md border px-3 py-0 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";

function toneButtonClass(active: boolean) {
  return `${toneButtonBase} ${
    active
      ? "border-transparent bg-gray-12 text-gray-1"
      : "border-gray-6 bg-transparent text-gray-11 hover:bg-gray-2/70"
  }`;
}

function toggleButtonClass() {
  return `${toneButtonBase} shrink-0 border-gray-6 bg-transparent text-gray-11 hover:bg-gray-2/70`;
}

export function AppearanceSettings(props: AppearanceSettingsProps) {
  return (
    <div className="space-y-6">
      <div className={`${settingsPanelClass} space-y-4`}>
        <div>
          <div className="text-sm font-medium text-gray-12">
            {t("settings.appearance_title")}
          </div>
          <div className="text-xs text-gray-9">
            {t("settings.appearance_hint")}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={toneButtonClass(props.themeMode === "system")}
            onClick={() => props.onThemeModeChange("system")}
            disabled={props.busy}
          >
            {t("settings.theme_system")}
          </button>
          <button
            type="button"
            className={toneButtonClass(props.themeMode === "light")}
            onClick={() => props.onThemeModeChange("light")}
            disabled={props.busy}
          >
            {t("settings.theme_light")}
          </button>
          <button
            type="button"
            className={toneButtonClass(props.themeMode === "dark")}
            onClick={() => props.onThemeModeChange("dark")}
            disabled={props.busy}
          >
            {t("settings.theme_dark")}
          </button>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-11">
            {t("settings.language")}
          </div>
          <div className="text-xs text-gray-9">
            {t("settings.language.description")}
          </div>
          <div className="flex flex-wrap gap-2">
            {LANGUAGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={toneButtonClass(props.language === option.value)}
                onClick={() => props.onLanguageChange(option.value)}
                disabled={props.busy}
              >
                {option.nativeName}
              </button>
            ))}
          </div>
        </div>

        <div className="text-xs text-gray-8">
          {t("settings.theme_system_hint")}
        </div>
      </div>

      {props.showWindowAppearance ? (
        <div className={`${settingsPanelClass} space-y-3`}>
          <div>
            <div className="text-sm font-medium text-gray-12">
              {t("settings.appearance_title")}
            </div>
            <div className="text-xs text-gray-10">
              {t("settings.window_appearance_desc")}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-6 bg-gray-1 p-3">
            <div className="min-w-0">
              <div className="text-sm text-gray-12">
                {t("settings.hide_titlebar")}
              </div>
              <div className="text-xs text-gray-7">
                {t("settings.hide_titlebar_desc")}
              </div>
            </div>
            <button
              type="button"
              className={toggleButtonClass()}
              onClick={props.onToggleHideTitlebar}
              disabled={props.busy}
            >
              {props.hideTitlebar ? t("settings.on") : t("settings.off")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default AppearanceSettings;
