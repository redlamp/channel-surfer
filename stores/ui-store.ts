"use client";

import { create } from "zustand";

/** A sampled pixel: sRGB channel values plus image pixel coordinates and
 * the intra-image UV it was sampled at (u right, v up). */
export interface SampledColor {
  r: number;
  g: number;
  b: number;
  x: number;
  y: number;
  u: number;
  v: number;
}

interface UiState {
  /** Live color under the cursor, null when not over the grid. */
  hoverColor: SampledColor | null;
  /** Pinned sample (single pin), survives hover. */
  pinnedColor: SampledColor | null;
  /** The WebGL canvas element, for PNG export. */
  canvasEl: HTMLCanvasElement | null;
  setHoverColor: (c: SampledColor | null) => void;
  setPinnedColor: (c: SampledColor | null) => void;
  setCanvasEl: (el: HTMLCanvasElement | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  hoverColor: null,
  pinnedColor: null,
  canvasEl: null,
  setHoverColor: (hoverColor) => set({ hoverColor }),
  setPinnedColor: (pinnedColor) => set({ pinnedColor }),
  setCanvasEl: (canvasEl) => set({ canvasEl }),
}));
