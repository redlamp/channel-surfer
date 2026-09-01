"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_LAYOUT,
  normalizeLayout,
  type TransformKey,
} from "@/lib/tile-transforms";
import { SETTINGS_VERSION, migrateSettings } from "@/stores/settings-migrate";

/** localStorage key; the theme boot script in the root layout reads it. */
export const SETTINGS_STORAGE_KEY = "channel-surfer:settings";

/** Where the hue-map hover recalibration listens: nowhere, only on the
 * hue-map tile, or anywhere in the grid. */
export type HighlightMode = "off" | "tile" | "all";
/** Color model for the saturation/brightness tiles and readouts. */
export type ColorModel = "hsb" | "hsl";
/**
 * Space the tile transforms are computed in.
 *
 * There was an "auto" mode that followed the image's declared gamma;
 * it was dropped because real files effectively never declare linear
 * (only a PNG with a gAMA 1.0 chunk and no sRGB/ICC tag would), so it
 * never changed state and the control read as broken.
 */
export type ColorMath = "linear" | "srgb";

/** Hue-map rendering style (see wiki/research/hue-direction-encoding.md). */
export type HueMapStyle = "warmcool" | "glow" | "twilight" | "diamond" | "crawl";

/** UI theme. "system" follows prefers-color-scheme. */
export type Theme = "dark" | "light" | "system";

/** Everything that changes what the tiles and readouts SHOW. "Reset to
 * defaults" restores exactly this set. */
export interface DisplaySettings {
  highlightMode: HighlightMode;
  /** RGB channel tiles ("Tint"): false = black-to-white, true = black-to-color. */
  rgbColorize: boolean;
  /** The same for the chroma tile, toggled independently of the channels. */
  chromaColorize: boolean;
  colorModel: ColorModel;
  hueMapStyle: HueMapStyle;
  /** Which effect each of the nine grid positions carries, reading order.
   * The effect library lives in lib/tile-transforms.ts. */
  tileLayout: TransformKey[];
  /** Brightness the "mid" effect pins every pixel to, 0-1. */
  midLevel: number;
  /** Chroma (max-min) below which a pixel counts as neutral, shared by
   * every hue-family effect. Stored 0-1; the UI talks in 255ths. */
  neutralTolerance: number;
  /** Smooth stored chroma across JPEG subsampling blocks (luma kept as
   * is), so the hue-family tiles show gradients instead of 2x2 stairs
   * on 4:2:0 sources. Off = pixels exactly as stored. */
  chromaSmooth: boolean;
  /** Warm/cool tile: Color-blend the accents with the pixel's
   * luminosity ("shaded") instead of painting them flat. */
  warmCoolShade: boolean;
  /** Show the color-taylor style hex/HSB derivation steps for the hovered pixel. */
  showColorSteps: boolean;
  /** Readout RGB values as 0.0-1.0 floats instead of 0-255 ints. */
  rgbFloat: boolean;
  /** Show the color-taylor Hexagon (HSB wheel) as a hover card. */
  showColorHexagon: boolean;
  /** Tile math space: linear light (the Gigi original) or sRGB values
   * (matches how the readouts and most tools compute HSB). */
  colorMath: ColorMath;
}

/** Workspace preferences: how the app is arranged, not what it shows.
 * These deliberately survive "Reset to defaults". */
export interface WorkspaceSettings {
  /** Inspector panel width in px, user-resizable by dragging its edge. */
  panelWidth: number;
  /** Hexagon size in the Inspect tab, px — the grip under it adjusts. */
  panelHexSize: number;
  /** Labs: reveal experimental options (the non-default hue-map styles). */
  labs: boolean;
  theme: Theme;
}

export const DISPLAY_DEFAULTS: DisplaySettings = {
  highlightMode: "tile",
  rgbColorize: true,
  chromaColorize: false,
  colorModel: "hsb",
  hueMapStyle: "twilight",
  tileLayout: [...DEFAULT_LAYOUT],
  midLevel: 0.7,
  neutralTolerance: 5 / 255,
  chromaSmooth: false,
  warmCoolShade: true,
  showColorSteps: false,
  rgbFloat: false,
  showColorHexagon: false,
  colorMath: "srgb",
};

export const WORKSPACE_DEFAULTS: WorkspaceSettings = {
  panelWidth: 340,
  panelHexSize: 160,
  labs: false,
  theme: "dark",
};

interface SettingsActions {
  setHighlightMode: (mode: HighlightMode) => void;
  setRgbColorize: (on: boolean) => void;
  setChromaColorize: (on: boolean) => void;
  setColorModel: (model: ColorModel) => void;
  setHueMapStyle: (style: HueMapStyle) => void;
  /** Hot-swap one tile's effect. */
  setTileTransform: (index: number, key: TransformKey) => void;
  /** Load a whole grid at once (a preset, or a reset). */
  setTileLayout: (layout: readonly TransformKey[]) => void;
  setMidLevel: (level: number) => void;
  setNeutralTolerance: (tol: number) => void;
  setChromaSmooth: (on: boolean) => void;
  setWarmCoolShade: (on: boolean) => void;
  setPanelWidth: (px: number) => void;
  setPanelHexSize: (px: number) => void;
  setShowColorSteps: (on: boolean) => void;
  setRgbFloat: (on: boolean) => void;
  setLabs: (on: boolean) => void;
  setShowColorHexagon: (on: boolean) => void;
  setColorMath: (space: ColorMath) => void;
  setTheme: (theme: Theme) => void;
  /** Restore every display setting; workspace preferences stay. */
  reset: () => void;
}

export type SettingsState = DisplaySettings & WorkspaceSettings & SettingsActions;

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DISPLAY_DEFAULTS,
      ...WORKSPACE_DEFAULTS,
      setHighlightMode: (highlightMode) => set({ highlightMode }),
      setRgbColorize: (rgbColorize) => set({ rgbColorize }),
      setChromaColorize: (chromaColorize) => set({ chromaColorize }),
      setColorModel: (colorModel) => set({ colorModel }),
      setHueMapStyle: (hueMapStyle) => set({ hueMapStyle }),
      setTileTransform: (index, key) =>
        set((state) => {
          if (index < 0 || index >= state.tileLayout.length) return state;
          const tileLayout = [...state.tileLayout];
          tileLayout[index] = key;
          return { tileLayout };
        }),
      setTileLayout: (layout) => set({ tileLayout: normalizeLayout(layout) }),
      setMidLevel: (midLevel) =>
        set({ midLevel: Math.min(Math.max(midLevel, 0), 1) }),
      setNeutralTolerance: (neutralTolerance) =>
        set({ neutralTolerance: Math.min(Math.max(neutralTolerance, 0), 0.2) }),
      setChromaSmooth: (chromaSmooth) => set({ chromaSmooth }),
      setWarmCoolShade: (warmCoolShade) => set({ warmCoolShade }),
      setPanelWidth: (panelWidth) =>
        set({ panelWidth: Math.min(Math.max(panelWidth, 300), 520) }),
      setPanelHexSize: (panelHexSize) =>
        set({ panelHexSize: Math.min(Math.max(panelHexSize, 80), 320) }),
      setShowColorSteps: (showColorSteps) => set({ showColorSteps }),
      setRgbFloat: (rgbFloat) => set({ rgbFloat }),
      setLabs: (labs) => set({ labs }),
      setShowColorHexagon: (showColorHexagon) => set({ showColorHexagon }),
      setColorMath: (colorMath) => set({ colorMath }),
      setTheme: (theme) => set({ theme }),
      reset: () =>
        set({ ...DISPLAY_DEFAULTS, tileLayout: [...DEFAULT_LAYOUT] }),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      // Version history and the upgrade steps live in settings-migrate.ts.
      // New fields are additive — zustand merges defaults in (`theme`
      // arrived that way on 2026-09-01).
      version: SETTINGS_VERSION,
      migrate: migrateSettings,
    },
  ),
);
