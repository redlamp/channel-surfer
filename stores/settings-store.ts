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
  /** Warm/cool tile: multiply the accents by the pixel's brightness
   * ("shaded", like Hue-shaded) instead of painting them flat. */
  warmCoolShade: boolean;
  /** Inspector panel width in px, user-resizable by dragging its edge. */
  panelWidth: number;
  /** Hexagon size in the Inspect tab, px — the grip under it adjusts. */
  panelHexSize: number;
  /** Show the color-taylor style hex/HSB derivation steps for the hovered pixel. */
  showColorSteps: boolean;
  /** Readout RGB values as 0.0-1.0 floats instead of 0-255 ints. */
  rgbFloat: boolean;
  /** Labs: reveal experimental options (the non-default hue-map styles). */
  labs: boolean;
  /** Show the color-taylor Hexagon (HSB wheel) below the canvas. */
  showColorHexagon: boolean;
  /** Tile math space: linear light (the Gigi original) or sRGB values
   * (matches how the readouts and most tools compute HSB). */
  colorMath: ColorMath;
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
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
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
      panelWidth: 340,
      panelHexSize: 160,
      showColorSteps: false,
      rgbFloat: false,
      labs: false,
      showColorHexagon: false,
      colorMath: "srgb",
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
    }),
    {
      name: "channel-surfer:settings",
      // v1: default highlightMode changed "all" -> "tile". v2: the static
      // "bands" hue-map style became the animated "crawl". v3: twilight
      // won the style bake-off and becomes the default once for everyone;
      // the other styles live behind the Labs flag. v4: black-to-color
      // tint becomes the default once. v5: gamma followed the image
      // ("auto"). v6: auto is gone — those settings move to sRGB, now
      // the default. v7: chroma smoothing demoted to Labs — reset once
      // so nobody keeps an invisible effect switched on from testing.
      // v8: the 2026-08-27 shipping grid (chroma/warm-cool up top, hue
      // map retired from the default) plus white chroma tint and shaded
      // warm/cool become the defaults once for everyone.
      // (New fields are additive — zustand merges defaults in.)
      version: 8,
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
        if (version <= 6) state.chromaSmooth = false;
        if (version <= 7) {
          state.tileLayout = [...DEFAULT_LAYOUT];
          state.chromaColorize = false;
          state.warmCoolShade = true;
        }
        // Layouts are stored as effect keys, so a retired or renamed
        // effect falls back to whatever ships in that position.
        state.tileLayout = normalizeLayout(state.tileLayout);
        return state as SettingsState;
      },
    },
  ),
);
