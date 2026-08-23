"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Where the hue-map hover recalibration listens: nowhere, only on the
 * hue-map tile, or anywhere in the grid. */
export type HighlightMode = "off" | "tile" | "all";
/** Color model for the saturation/brightness tiles and readouts. */
export type ColorModel = "hsb" | "hsl";
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
  setHighlightMode: (mode: HighlightMode) => void;
  setRgbColorize: (on: boolean) => void;
  setColorModel: (model: ColorModel) => void;
  setHueMapStyle: (style: HueMapStyle) => void;
  setShowColorSteps: (on: boolean) => void;
  setRgbFloat: (on: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      highlightMode: "tile",
      rgbColorize: false,
      colorModel: "hsb",
      hueMapStyle: "warmcool",
      showColorSteps: false,
      rgbFloat: false,
      setHighlightMode: (highlightMode) => set({ highlightMode }),
      setRgbColorize: (rgbColorize) => set({ rgbColorize }),
      setColorModel: (colorModel) => set({ colorModel }),
      setHueMapStyle: (hueMapStyle) => set({ hueMapStyle }),
      setShowColorSteps: (showColorSteps) => set({ showColorSteps }),
      setRgbFloat: (rgbFloat) => set({ rgbFloat }),
    }),
    {
      name: "channel-surfer:settings",
      // v1: default highlightMode changed "all" -> "tile". v2: the static
      // "bands" hue-map style became the animated "crawl".
      // (New fields are additive — zustand merges defaults in.)
      version: 2,
      migrate: (persisted, version) => {
        const state = persisted as Omit<
          Partial<SettingsState>,
          "hueMapStyle"
        > & { hueMapStyle?: string };
        if (version === 0) state.highlightMode = "tile";
        if (version <= 1 && state.hueMapStyle === "bands")
          state.hueMapStyle = "crawl";
        return state as SettingsState;
      },
    },
  ),
);
