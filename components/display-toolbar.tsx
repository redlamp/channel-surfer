"use client";

import { Segmented } from "@/components/ui/segmented";
import { useSettingsStore } from "@/stores/settings-store";

/**
 * The one setting worth flipping while reading tiles, surfaced on the
 * main screen: which color model the saturation/brightness tiles use.
 * Gamma lives in Settings only — it's a set-once choice (sRGB default,
 * matching the readouts and most tools), not something to toggle
 * mid-read. Writes the same store the Settings panel does.
 */
export function DisplayToolbar() {
  const colorModel = useSettingsStore((s) => s.colorModel);
  const setColorModel = useSettingsStore((s) => s.setColorModel);

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
      <div className="flex items-center gap-2">
        <span className="font-mono text-base text-muted-foreground">Model</span>
        <Segmented
          size="sm"
          value={colorModel}
          onChange={setColorModel}
          options={[
            { value: "hsb", label: "HSB", title: "Hue, saturation, brightness" },
            { value: "hsl", label: "HSL", title: "Hue, saturation, lightness" },
          ]}
        />
      </div>
    </div>
  );
}
