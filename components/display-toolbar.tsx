"use client";

import { Segmented } from "@/components/ui/segmented";
import { useSettingsStore } from "@/stores/settings-store";

/**
 * The two settings that change what the tiles mean, surfaced on the main
 * screen rather than only in Settings: which color model the
 * saturation/brightness tiles use, and which space the transforms run
 * in. Both write the same store the Settings panel does.
 */
export function DisplayToolbar() {
  const colorModel = useSettingsStore((s) => s.colorModel);
  const setColorModel = useSettingsStore((s) => s.setColorModel);
  const colorMath = useSettingsStore((s) => s.colorMath);
  const setColorMath = useSettingsStore((s) => s.setColorMath);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
      <div className="flex items-center gap-2">
        <span className="font-mono text-base text-muted-foreground">Math</span>
        <Segmented
          size="sm"
          value={colorMath}
          onChange={setColorMath}
          options={[
            {
              value: "linear",
              label: "Linear",
              title: "Transforms run in linear light (the Gigi original)",
            },
            {
              value: "srgb",
              label: "sRGB",
              title: "Transforms run on sRGB values (matches the readouts)",
            },
          ]}
        />
      </div>
    </div>
  );
}
