import { useTranslation } from "react-i18next";
import { Smartphone } from "lucide-react";

import {
  setDeviceModePreference,
  useDeviceModePreference,
  type DeviceModePreference,
} from "../../../lib/platform";
import { SettingsChoiceCards } from "./SettingsChoiceCards";

const CHOICES: DeviceModePreference[] = ["auto", "phone", "tablet"];

/**
 * Android only: which of the two touch layouts to draw. Automatic goes
 * by the screen's shortest side; the other two pin one, for a large
 * phone that wants the docked panels or a small tablet that does not.
 */
export function DeviceLayoutCard() {
  const { t } = useTranslation();
  const preference = useDeviceModePreference();

  return (
    <section
      aria-labelledby="settings-device-layout-heading"
      className="settings-block"
    >
      <header className="flex items-start gap-4 mb-4">
        <Smartphone
          size={16}
          className="settings-row-icon"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <h3
            id="settings-device-layout-heading"
            className="text-sm font-medium text-zinc-900 dark:text-white"
          >
            {t("android.layout.title")}
          </h3>
          <p className="text-xs mt-0.5 settings-description">
            {t("android.layout.description")}
          </p>
        </div>
      </header>

      <SettingsChoiceCards
        labelledBy="settings-device-layout-heading"
        minWidth={7}
        value={preference}
        onChange={(id) => setDeviceModePreference(id)}
        choices={CHOICES.map((id) => ({
          value: id,
          label: t(`android.layout.${id}`),
        }))}
      />
    </section>
  );
}
