"use client";

import { useId } from "react";
import { useSettingsStore } from "@/stores/settings-store";

export function HueControls({ tile }: { tile: number }) {
  const id = useId();
  const hue = useSettingsStore((s) => s.hueTiles[tile]);
  const setHueTile = useSettingsStore((s) => s.setHueTile);
  const updateHue = (patch: Parameters<typeof setHueTile>[1]) => setHueTile(tile, patch);
  return (
    <div className="flex w-full min-w-0 flex-col gap-2 py-1" role="group" aria-label="Hue controls">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={`${id}-saturation`} className="text-muted-foreground">Saturation</label>
        <label className="flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" aria-label="Uniform saturation" checked={hue.saturation !== "original"}
            onChange={(e) => updateHue({ saturation: e.target.checked ? hue.lastSaturation ?? 1 : "original" })} /> Uniform
        </label>
        <span data-testid="hue-saturation-value" className="inline-block w-[4ch] shrink-0 whitespace-pre text-right font-mono tabular-nums">
          {hue.saturation === "original" ? " ---" : `${String(Math.round(hue.saturation * 100)).padStart(3, " ")}%`}
        </span>
      </div>
      <input id={`${id}-saturation`} type="range" min={0} max={100} step={1}
        className="w-full accent-primary disabled:opacity-40" disabled={hue.saturation === "original"}
        value={Math.round((hue.saturation === "original" ? hue.lastSaturation ?? 1 : hue.saturation) * 100)}
        onChange={(e) => updateHue({ saturation: Number(e.target.value) / 100 })} />
      <div className="flex items-center justify-between">
        <label htmlFor={`${id}-brightness`} className="text-muted-foreground">Brightness</label>
        <label className="flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" aria-label="Uniform brightness" checked={hue.flat} onChange={(e) => updateHue({ flat: e.target.checked })} /> Uniform
        </label>
        <span data-testid="hue-brightness-value" className="inline-block w-[4ch] shrink-0 whitespace-pre text-right font-mono tabular-nums">
          {hue.flat ? `${String(Math.round(hue.brightness * 100)).padStart(3, " ")}%` : " ---"}
        </span>
      </div>
      <input id={`${id}-brightness`} type="range" min={0} max={100} step={1}
        className="w-full accent-primary disabled:opacity-40" disabled={!hue.flat} value={Math.round(hue.brightness * 100)}
        onChange={(e) => updateHue({ brightness: Number(e.target.value) / 100 })} />
    </div>
  );
}
