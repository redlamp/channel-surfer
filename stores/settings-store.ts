"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Where the hue-map hover recalibration listens: nowhere, only on the
 * hue-map tile, or anywhere in the grid. */
export type HighlightMode = "off" | "tile" | "all";

interface SettingsState {
  highlightMode: HighlightMode;
  /** RGB channel tiles: false = black-to-white, true = black-to-color. */
  rgbColorize: boolean;
  setHighlightMode: (mode: HighlightMode) => void;
  setRgbColorize: (on: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      highlightMode: "all",
      rgbColorize: false,
      setHighlightMode: (highlightMode) => set({ highlightMode }),
      setRgbColorize: (rgbColorize) => set({ rgbColorize }),
    }),
    { name: "channel-surfer:settings" },
  ),
);
