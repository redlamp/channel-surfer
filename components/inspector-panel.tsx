"use client";

import { HexDock } from "@/components/hex-widget";
import { PanelReadout } from "@/components/color-readout";
import { Segmented } from "@/components/ui/segmented";
import { LibraryPanel, SelectionDetails } from "@/components/library-panel";
import { SettingsPanel } from "@/components/settings-panel";
import { TILE_TRANSFORMS } from "@/lib/tile-transforms";
import { GAMUT_LABEL, useDisplayGamut } from "@/lib/display-gamut";
import { useSettingsStore } from "@/stores/settings-store";
import { useUiStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

export type PanelTab = "inspect" | "library" | "settings";

const TABS: { key: PanelTab; label: string }[] = [
  { key: "inspect", label: "Inspect" },
  { key: "library", label: "Library" },
  { key: "settings", label: "Settings" },
];

/** The Inspect tab: hexagon, hovered/pinned readouts, the hovered
 * tile's name, the color model, and the image's facts — everything
 * about the pixel under the cursor, in one column. */
/** Drag the grip under the hexagon vertically to resize it. */
function beginHexResize(e: React.PointerEvent<HTMLElement>) {
  if (e.button !== 0) return;
  e.preventDefault();
  const pid = e.pointerId;
  const startY = e.clientY;
  const startSize = useSettingsStore.getState().panelHexSize;
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== pid) return;
    useSettingsStore.getState().setPanelHexSize(
      startSize + (ev.clientY - startY),
    );
  };
  const done = (ev: PointerEvent) => {
    if (ev.pointerId !== pid) return;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", done);
    window.removeEventListener("pointercancel", done);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", done);
  window.addEventListener("pointercancel", done);
}

/** The active tile's own toggle (the same control its context bar
 * carries), pinned in the panel so a FOCUSED tile's setting can be
 * changed without chasing the bar. */
function TileSubSetting({ tileKey }: { tileKey: string | null }) {
  const warmCoolShade = useSettingsStore((s) => s.warmCoolShade);
  const setWarmCoolShade = useSettingsStore((s) => s.setWarmCoolShade);
  const chromaColorize = useSettingsStore((s) => s.chromaColorize);
  const setChromaColorize = useSettingsStore((s) => s.setChromaColorize);
  const rgbColorize = useSettingsStore((s) => s.rgbColorize);
  const setRgbColorize = useSettingsStore((s) => s.setRgbColorize);

  let label: string;
  let control: React.ReactNode;
  if (tileKey === "warmCool") {
    label = "Shade";
    control = (
      <Segmented
        size="sm"
        value={warmCoolShade ? "shaded" : "flat"}
        options={[
          { value: "flat", label: "Flat" },
          { value: "shaded", label: "Shaded" },
        ]}
        onChange={(v) => setWarmCoolShade(v === "shaded")}
      />
    );
  } else if (tileKey === "chroma") {
    label = "Tint";
    control = (
      <Segmented
        size="sm"
        value={chromaColorize ? "color" : "gray"}
        options={[
          { value: "gray", label: "White" },
          { value: "color", label: "Color" },
        ]}
        onChange={(v) => setChromaColorize(v === "color")}
      />
    );
  } else if (tileKey === "red" || tileKey === "green" || tileKey === "blue") {
    label = "Tint";
    control = (
      <Segmented
        size="sm"
        value={rgbColorize ? "color" : "gray"}
        options={[
          { value: "gray", label: "White" },
          { value: "color", label: "Color" },
        ]}
        onChange={(v) => setRgbColorize(v === "color")}
      />
    );
  } else {
    return null;
  }
  return (
    <div className="flex items-center justify-between gap-3 font-mono">
      <span className="text-sm text-muted-foreground">{label}</span>
      {control}
    </div>
  );
}

/** What the screen can show versus what the tiles are rendered in. The
 * canvas is sRGB end to end (see wiki/research/wide-gamut.md), so on a
 * P3 or Rec. 2020 display the row says so rather than letting the wider
 * gamut pass unnoticed. */
function DisplayGamutRow() {
  const gamut = useDisplayGamut();
  return (
    <div className="flex items-baseline justify-between gap-3 px-0">
      <span className="text-base text-muted-foreground">Display</span>
      <span
        className="text-right font-mono text-base"
        title={
          gamut === "srgb"
            ? "This display reports the sRGB gamut, which is what the tiles are rendered in."
            : `This display can show ${GAMUT_LABEL[gamut]}; the tiles and readouts are sRGB, so wider colours in a tagged source are clipped on decode.`
        }
      >
        {GAMUT_LABEL[gamut]}
        {gamut !== "srgb" && (
          <span className="text-muted-foreground"> · tiles sRGB</span>
        )}
      </span>
    </div>
  );
}

function InspectTab() {
  const tileLayout = useSettingsStore((s) => s.tileLayout);
  const panelWidth = useSettingsStore((s) => s.panelWidth);
  const panelHexSize = useSettingsStore((s) => s.panelHexSize);
  const hoverTile = useUiStore((s) => s.hoverTile);
  const framedTile = useUiStore((s) => s.framedTile);
  const pinnedTile = useUiStore((s) => s.pinnedTile);
  // Focus wins, then live hover, then the pin-selected tile — so a pin
  // keeps its tile's details (and sub-setting) editable here without
  // framing it.
  const labelTile = framedTile ?? hoverTile ?? pinnedTile;
  const tileKey = labelTile === null ? null : tileLayout[labelTile];
  const tileName =
    tileKey === null ? "—" : TILE_TRANSFORMS[tileKey].name;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <div className="flex flex-col items-center gap-1">
        {/* User-sized (the grip below), never wider than the rail. */}
        <HexDock size={Math.min(panelWidth - 40, panelHexSize)} />
        <div
          className="h-1.5 w-12 cursor-row-resize touch-none rounded-full bg-muted transition-colors hover:bg-ring/60"
          title="Drag to resize the hexagon"
          onPointerDown={beginHexResize}
        />
      </div>
      <PanelReadout />
      <hr className="border-border" />
      <div className="flex items-center justify-between gap-3 font-mono">
        <span className="text-sm text-muted-foreground">Tile</span>
        <span className="truncate text-base">{tileName}</span>
      </div>
      <TileSubSetting tileKey={tileKey} />
      {/* Spacer: everything below aligns to the bottom of the panel. */}
      <div className="min-h-2 flex-1" />
      <hr className="border-border" />
      {/* SelectionDetails brings its own padding; pull it flush. */}
      <div className="-mx-3 -my-2">
        <SelectionDetails />
      </div>
      <DisplayGamutRow />
      <p className="text-center text-sm text-muted-foreground">
        Images stay on your device
      </p>
    </div>
  );
}

/** Drag the panel's left edge to resize; width persists in settings. */
function beginPanelResize(e: React.PointerEvent<HTMLElement>) {
  if (e.button !== 0) return;
  e.preventDefault();
  const pid = e.pointerId;
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== pid) return;
    // Panel spans from the drag edge to 12px short of the window edge.
    useSettingsStore.getState().setPanelWidth(
      window.innerWidth - ev.clientX - 12,
    );
  };
  const done = (ev: PointerEvent) => {
    if (ev.pointerId !== pid) return;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", done);
    window.removeEventListener("pointercancel", done);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", done);
  window.addEventListener("pointercancel", done);
}

/**
 * The right-side overlay panel from the layout redesign: floats over
 * the display area (translucent, blurred) rather than taking layout
 * space, with the color inspector, media library, and settings as
 * tabs. Toggled from the header's panel-right button; one width for
 * every tab, user-resizable by its left edge. On narrow windows it is
 * a bottom sheet instead (`sheet`), full width and a fixed share of
 * the window height, so the grid keeps the top of the screen.
 */
export function InspectorPanel({
  tab,
  onTab,
  onClose,
  sheet = false,
}: {
  tab: PanelTab;
  onTab: (tab: PanelTab) => void;
  onClose: () => void;
  sheet?: boolean;
}) {
  const panelWidth = useSettingsStore((s) => s.panelWidth);
  // Track the measured header height so a wrapped (two-line) header
  // pushes the panel down instead of being overlapped.
  const headerH = useUiStore((s) => s.viewInsets.top);
  return (
    <aside
      style={sheet ? undefined : { width: panelWidth, top: headerH + 12 }}
      className={cn(
        "absolute z-20 flex flex-col overflow-hidden rounded-md border border-border bg-card/85 shadow-[var(--shadow-lg)] backdrop-blur-md",
        // The sheet's height must agree with SHEET_FRACTION in surfer-app.
        sheet ? "inset-x-3 bottom-3 h-[55dvh]" : "right-3 bottom-3",
      )}
    >
      {!sheet && (
        <div
          className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize touch-none hover:bg-ring/40"
          title="Drag to resize"
          onPointerDown={beginPanelResize}
        />
      )}
      <div className="flex shrink-0 border-b border-border font-mono text-sm">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tab === t.key}
            onClick={() => onTab(t.key)}
            className={cn(
              "flex-1 cursor-pointer border-b-2 py-2 text-center transition-colors",
              tab === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "inspect" && <InspectTab />}
      {tab === "library" && <LibraryPanel embedded onClose={onClose} />}
      {tab === "settings" && <SettingsPanel embedded onClose={onClose} />}
    </aside>
  );
}
