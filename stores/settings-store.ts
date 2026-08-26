"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_LAYOUT,
  normalizeLayout,
  type TransformKey,
} from "@/lib/tile-transforms";

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



interface SettingsState {
  highlightMode: HighlightMode;
  /** RGB channel tiles ("Tint"): false = black-to-white, true = black-to-color. */
  rgbColorize: boolean;
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
  /** Show the color-taylor style hex/HSB derivation steps for the hovered pixel. */
  showColorSteps: boolean;
  /** Readout RGB values as 0.0-1.0 floats instead of 0-255 ints. */
  rgbFloat: boolean;
  /** Labs: reveal experimental options (the non-default hue-map styles). */
  labs: boolean;
  /** Show the color-taylor Hexagon (HSB wheel) below the canvas. */
  showColorHexagon: boolean;
  /** Tile math space: linear light (the Gigi original), sRGB values
   * (matches how the readouts and most tools compute HSB), or auto —
   * follow whatever the loaded image declares. */
  colorMath: ColorMath;
  setHighlightMode: (mode: HighlightMode) => void;
  setRgbColorize: (on: boolean) => void;
  setColorModel: (model: ColorModel) => void;
  setHueMapStyle: (style: HueMapStyle) => void;
  /** Hot-swap one tile's effect. */
  setTileTransform: (index: number, key: TransformKey) => void;
  /** Load a whole grid at once (a preset, or a reset). */
  setTileLayout: (layout: readonly TransformKey[]) => void;
  setMidLevel: (level: number) => void;
  setNeutralTolerance: (tol: number) => void;
  setShowColorSteps: (on: boolean) => void;
  setRgbFloat: (on: boolean) => void;
  setLabs: (on: boolean) => void;
  setShowColorHexagon: (on: boolean) => void;
  setColorMath: (space: ColorMath) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      highlightMode: "tile",
      rgbColorize: true,
      colorModel: "hsb",
      hueMapStyle: "twilight",
      tileLayout: [...DEFAULT_LAYOUT],
      midLevel: 0.7,
      neutralTolerance: 5 / 255,
      showColorSteps: false,
      rgbFloat: false,
      labs: false,
      showColorHexagon: false,
      colorMath: "srgb",
      setHighlightMode: (highlightMode) => set({ highlightMode }),
      setRgbColorize: (rgbColorize) => set({ rgbColorize }),
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
      setShowColorSteps: (showColorSteps) => set({ showColorSteps }),
      setRgbFloat: (rgbFloat) => set({ rgbFloat }),
      setLabs: (labs) => set({ labs }),
      setShowColorHexagon: (showColorHexagon) => set({ showColorHexagon }),
      setColorMath: (colorMath) => set({ colorMath }),
    }),
    {
      name: "channel-surfer:settings",
      // v1: default highlightMode changed "all" -> "tile". v2: the static
      // "bands" hue-map style became the animated "crawl". v3: twilight
      // won the style bake-off and becomes the default once for everyone;
      // the other styles live behind the Labs flag. v4: black-to-color
      // tint becomes the default once. v5: gamma followed the image
      // ("auto"). v6: auto is gone — those settings move to sRGB, now
      // the default.
      // (New fields are additive — zustand merges defaults in.)
      version: 6,
      migrate: (persisted, version) => {
        const state = persisted as Omit<
          Partial<SettingsState>,
          "hueMapStyle"
        > & { hueMapStyle?: string };
        if (version === 0) state.highlightMode = "tile";
        if (version <= 1 && state.hueMapStyle === "bands")
          state.hueMapStyle = "crawl";
        if (version <= 2) state.hueMapStyle = "twilight";
        if (version <= 3) state.rgbColorize = true;
        if (version <= 5) state.colorMath = "srgb";
        // Layouts are stored as effect keys, so a retired or renamed
        // effect falls back to whatever ships in that position.
        state.tileLayout = normalizeLayout(state.tileLayout);
        return state as SettingsState;
      },
    },
  ),
);
