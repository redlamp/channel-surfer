"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Where the hue-map hover recalibration listens: nowhere, only on the
 * hue-map tile, or anywhere in the grid. */
export type HighlightMode = "off" | "tile" | "all";
/** Color model for the saturation/brightness tiles and readouts. */
export type ColorModel = "hsb" | "hsl";
/** Hue-map rendering style. */
export type HueMapStyle = "warmcool" | "glow" | "bands";

interface SettingsState {
  highlightMode: HighlightMode;
  /** RGB channel tiles ("Tint"): false = black-to-white, true = black-to-color. */
  rgbColorize: boolean;
  colorModel: ColorModel;
  hueMapStyle: HueMapStyle;
  /** Show the color-taylor style hex/HSB derivation steps for the hovered pixel. */
  showColorSteps: boolean;
  setHighlightMode: (mode: HighlightMode) => void;
  setRgbColorize: (on: boolean) => void;
  setColorModel: (model: ColorModel) => void;
  setHueMapStyle: (style: HueMapStyle) => void;
  setShowColorSteps: (on: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      highlightMode: "tile",
      rgbColorize: false,
      colorModel: "hsb",
      hueMapStyle: "warmcool",
      showColorSteps: false,
      setHighlightMode: (highlightMode) => set({ highlightMode }),
      setRgbColorize: (rgbColorize) => set({ rgbColorize }),
      setColorModel: (colorModel) => set({ colorModel }),
      setHueMapStyle: (hueMapStyle) => set({ hueMapStyle }),
      setShowColorSteps: (showColorSteps) => set({ showColorSteps }),
    }),
    {
      name: "channel-surfer:settings",
      // v1: default highlightMode changed "all" -> "tile"; migrate stored
      // v0 state so existing browsers pick up the new default once.
      // (New fields since are additive — zustand merges defaults in.)
      version: 1,
      migrate: (persisted, version) => {
        const state = persisted as Partial<SettingsState>;
        if (version === 0) state.highlightMode = "tile";
        return state as SettingsState;
      },
    },
  ),
);
