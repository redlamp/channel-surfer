"use client";

import { Tags, SlidersHorizontal, ZoomIn, ZoomOut, Scan } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { canvasBridge } from "@/stores/ui-store";
import { Segmented } from "@/components/ui/segmented";
import { useSettingsStore } from "@/stores/settings-store";

/**
 * The one setting worth flipping while reading tiles, surfaced on the
 * main screen: which color model the saturation/brightness tiles use.
 * Gamma lives in Settings only — it's a set-once choice (sRGB default,
 * matching the readouts and most tools), not something to toggle
 * mid-read. Writes the same store the Settings panel does.
 */
export function DisplayToolbar({ onShowControls }: { onShowControls: () => void }) {
  const colorModel = useSettingsStore((s) => s.colorModel);
  const setColorModel = useSettingsStore((s) => s.setColorModel);

  const showControls = useSettingsStore((s) => s.showTileControls);
  const setShowControls = useSettingsStore((s) => s.setShowTileControls);
  const showNames = useSettingsStore((s) => s.showTileNames);
  const setShowNames = useSettingsStore((s) => s.setShowTileNames);

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
      <Button variant="outline" size="icon" className={showNames ? "bg-muted" : ""} title="Show tile names" aria-label="Show tile names" aria-pressed={showNames} onClick={() => setShowNames(!showNames)}><Tags aria-hidden /></Button>
      <Button variant="outline" size="icon" className={showControls ? "bg-muted" : ""} title="Show selected tile controls" aria-label="Show selected tile controls" aria-pressed={showControls} onClick={() => {
        setShowControls(!showControls);
        if (!showControls) onShowControls();
      }}><SlidersHorizontal aria-hidden /></Button>
      <ButtonGroup aria-label="Zoom controls">
        <Button variant="outline" size="icon" aria-label="Zoom out" title="Zoom out" onClick={() => canvasBridge.zoomBy?.(1 / 1.25)}><ZoomOut aria-hidden /></Button>
        <Button variant="outline" size="icon" aria-label="Zoom in" title="Zoom in" onClick={() => canvasBridge.zoomBy?.(1.25)}><ZoomIn aria-hidden /></Button>
        <Button variant="outline" aria-label="Actual size" title="1:1 — one image pixel per display pixel" onClick={() => canvasBridge.actualSize?.()} className="font-mono">1:1</Button>
        <Button variant="outline" size="icon" aria-label="Fit image" title="Fit image around open panels" onClick={() => canvasBridge.refit?.()}><Scan aria-hidden /></Button>
      </ButtonGroup>
    </div>
  );
}
