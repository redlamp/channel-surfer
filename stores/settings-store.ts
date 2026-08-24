"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Where the hue-map hover recalibration listens: nowhere, only on the
 * hue-map tile, or anywhere in the grid. */
export type HighlightMode = "off" | "tile" | "all";
/** Color model for the saturation/brightness tiles and readouts. */
export type ColorModel = "hsb" | "hsl";
/** Space the tile transforms are computed in. */
export type ColorMath = "linear" | "srgb" | "auto";

/**
 * What "auto" resolves to for a given image: its declared gamma if it
 * has one, else sRGB — untagged files are sRGB by convention, and that
 * also matches what the readouts compute.
 */
export function resolveColorMath(
  mode: ColorMath,
  declaredColorSpace: string | null,
): "linear" | "srgb" {
  if (mode !== "auto") return mode;
  if (declaredColorSpace && /gamma 1\.0/i.test(declaredColorSpace))
    return "linear";
  return "srgb";
}

/** Hue-map rendering style (see wiki/research/hue-direction-encoding.md). */
export type HueMapStyle = "warmcool" | "glow" | "twilight" | "diamond" | "crawl";

interface SettingsState {
  highlightMode: HighlightMode;
  /** RGB channel tiles ("Tint"): false = black-to-white, true = black-to-color. */
  rgbColorize: boolean;
  colorModel: ColorModel;
  hueMapStyle: HueMapStyle;
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
      showColorSteps: false,
      rgbFloat: false,
      labs: false,
      showColorHexagon: false,
      colorMath: "auto",
      setHighlightMode: (highlightMode) => set({ highlightMode }),
      setRgbColorize: (rgbColorize) => set({ rgbColorize }),
      setColorModel: (colorModel) => set({ colorModel }),
      setHueMapStyle: (hueMapStyle) => set({ hueMapStyle }),
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
      // tint becomes the default once. v5: gamma follows the image by
      // default (colorMath "auto").
      // (New fields are additive — zustand merges defaults in.)
      version: 5,
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
        if (version <= 4) state.colorMath = "auto";
        return state as SettingsState;
      },
    },
  ),
);
