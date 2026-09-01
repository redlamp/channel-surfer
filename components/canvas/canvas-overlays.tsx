"use client";

import { Focus } from "lucide-react";
import { HexagonInner } from "@/components/color-hexagon";
import { TILE_TRANSFORMS } from "@/lib/tile-transforms";
import { useSettingsStore } from "@/stores/settings-store";
import { canvasBridge, useUiStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";
import type { BarGroup } from "./geometry";

/** Badge shown while a newly selected image decodes; the old image stays
 * interactive underneath. */
export function DecodeBadge() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <p className="animate-pulse rounded-md border border-border bg-popover/90 px-3 py-1.5 font-mono text-base shadow-[var(--shadow-md)]">
        Decoding image…
      </p>
    </div>
  );
}

/** Tile title widget: hover name, or the framed tile's name in focus
 * mode, with the isolate (mask) toggle beside it. */
export function TileTitle({ hoverTile }: { hoverTile: number | null }) {
  const tileLayout = useSettingsStore((s) => s.tileLayout);
  const framedTile = useUiStore((s) => s.framedTile);
  const isolate = useUiStore((s) => s.isolate);
  const setIsolate = useUiStore((s) => s.setIsolate);
  // While a tile is framed its name stays locked in the title; hover
  // names only show in the zoomed-out grid view.
  const labelTile = framedTile ?? hoverTile;
  const tileName =
    labelTile === null ? " " : TILE_TRANSFORMS[tileLayout[labelTile]].name;

  return (
    <div
      className={cn(
        "absolute left-1/2 top-14 flex -translate-x-1/2 items-center gap-2 rounded-md border border-border bg-popover/90 px-3 py-1 font-mono text-base shadow-[var(--shadow-md)] transition-opacity duration-150",
        labelTile === null ? "opacity-0" : "opacity-100",
        framedTile === null ? "pointer-events-none" : "pointer-events-auto",
      )}
      aria-live="polite"
    >
      <span>{tileName}</span>
      {framedTile !== null && (
        <button
          type="button"
          aria-pressed={isolate}
          title={isolate ? "Show all tiles" : "Show only this tile"}
          className={cn(
            "cursor-pointer rounded-sm p-0.5 transition-colors",
            isolate
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => {
            setIsolate(!isolate);
            canvasBridge.invalidate?.();
          }}
        >
          <Focus className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

/** Hexagon hover card; the scene positions it per frame. */
export function HexCard() {
  const show = useSettingsStore((s) => s.showColorHexagon);
  if (!show) return null;
  return (
    <div
      ref={(el) => {
        canvasBridge.hexCardEl = el;
      }}
      style={{ display: "none" }}
      className="pointer-events-none absolute left-0 top-0 z-20 rounded-lg border border-border bg-popover/95 p-1.5 shadow-[var(--shadow-lg)]"
    >
      <HexagonInner />
    </div>
  );
}

function BarToggle({
  options,
  value,
  onChange,
}: {
  options: readonly (readonly [boolean, string])[];
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return options.map(([v, label]) => (
    <button
      key={label}
      type="button"
      aria-pressed={value === v}
      className={cn(
        "cursor-pointer rounded-sm px-1.5 transition-colors",
        value === v
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
      onClick={() => {
        onChange(v);
        canvasBridge.invalidate?.();
      }}
    >
      {label}
    </button>
  ));
}

const SHADE_OPTIONS = [
  [false, "Flat"],
  [true, "Shaded"],
] as const;
const TINT_OPTIONS = [
  [false, "White"],
  [true, "Color"],
] as const;

/**
 * Context bar (Tint or warm/cool Shade) under the hovered tile; the
 * scene positions it per frame. `group` is latched by the shell to the
 * last bar-carrying tile hovered, not read from live hover: moving the
 * cursor off the tile and onto the bar clears the hover, which would
 * otherwise fall back to the wrong control.
 */
export function ContextBar({ group }: { group: BarGroup | null }) {
  const rgbColorize = useSettingsStore((s) => s.rgbColorize);
  const setRgbColorize = useSettingsStore((s) => s.setRgbColorize);
  const chromaColorize = useSettingsStore((s) => s.chromaColorize);
  const setChromaColorize = useSettingsStore((s) => s.setChromaColorize);
  const warmCoolShade = useSettingsStore((s) => s.warmCoolShade);
  const setWarmCoolShade = useSettingsStore((s) => s.setWarmCoolShade);

  return (
    <div
      ref={(el) => {
        canvasBridge.tintBarEl = el;
      }}
      style={{ display: "none" }}
      className="absolute z-10 -translate-x-1/2 items-center gap-2 rounded-md border border-border bg-popover/95 px-2.5 py-1 font-mono text-base shadow-[var(--shadow-md)]"
      onMouseEnter={() => {
        canvasBridge.tintBarHover = true;
      }}
      onMouseLeave={() => {
        canvasBridge.tintBarHover = false;
        window.setTimeout(() => canvasBridge.invalidate?.(), 50);
      }}
    >
      <span className="text-muted-foreground">
        {group === "warmcool" ? "Shade" : "Tint"}
      </span>
      {group === "warmcool" ? (
        <BarToggle options={SHADE_OPTIONS} value={warmCoolShade} onChange={setWarmCoolShade} />
      ) : group === "chroma" ? (
        <BarToggle options={TINT_OPTIONS} value={chromaColorize} onChange={setChromaColorize} />
      ) : (
        <BarToggle options={TINT_OPTIONS} value={rgbColorize} onChange={setRgbColorize} />
      )}
    </div>
  );
}
