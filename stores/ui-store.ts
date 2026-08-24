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
  /** Last non-null hover sample — lets panels stay populated off-hover. */
  lastHoverColor: SampledColor | null;
  /** Pinned sample (single pin), survives hover. */
  pinnedColor: SampledColor | null;
  /** The WebGL canvas element, for PNG export. */
  canvasEl: HTMLCanvasElement | null;
  /** Tile currently under the cursor, null when not over the grid. */
  hoverTile: number | null;
  /** The hexagon widget: docked in the header or floating anywhere.
   * x/y are the floating card's viewport position. */
  hexWidget: {
    mode: "docked" | "floating";
    size: number;
    x: number;
    y: number;
  };
  /** True while the hexagon widget is mid-drag (drop targets light up). */
  hexDragging: boolean;
  /** Tile currently framed by focus mode, null when viewing the grid. */
  framedTile: number | null;
  /** Focus-mode isolation: hide the non-focused tiles while framed. */
  isolate: boolean;
  setHoverColor: (c: SampledColor | null) => void;
  setPinnedColor: (c: SampledColor | null) => void;
  setCanvasEl: (el: HTMLCanvasElement | null) => void;
  setHoverTile: (tile: number | null) => void;
  setFramedTile: (tile: number | null) => void;
  setIsolate: (on: boolean) => void;
  setHexWidget: (patch: Partial<UiState["hexWidget"]>) => void;
  setHexDragging: (on: boolean) => void;
}

/**
 * Non-reactive bridge between the canvas scene (inside R3F) and its DOM
 * shell. Mutated from effects, handlers, and useFrame — never from render
 * — and deliberately not React state: these values change per frame.
 */
export const canvasBridge = {
  tintBarEl: null as HTMLDivElement | null,
  tintBarHover: false,
  meshDblAt: 0,
  invalidate: null as (() => void) | null,
  refit: null as (() => void) | null,
  /** The hexagon hover card, positioned per-frame by the scene. */
  hexCardEl: null as HTMLDivElement | null,
};

export const useUiStore = create<UiState>((set) => ({
  hoverColor: null,
  lastHoverColor: null,
  pinnedColor: null,
  canvasEl: null,
  hoverTile: null,
  framedTile: null,
  isolate: false,
  hexWidget: { mode: "docked", size: 81, x: 24, y: 90 },
  hexDragging: false,
  setHoverColor: (hoverColor) =>
    set(hoverColor ? { hoverColor, lastHoverColor: hoverColor } : { hoverColor }),
  setPinnedColor: (pinnedColor) => set({ pinnedColor }),
  setCanvasEl: (canvasEl) => set({ canvasEl }),
  setHoverTile: (hoverTile) => set({ hoverTile }),
  setFramedTile: (framedTile) => set({ framedTile }),
  setIsolate: (isolate) => set({ isolate }),
  setHexWidget: (patch) =>
    set((s) => ({ hexWidget: { ...s.hexWidget, ...patch } })),
  setHexDragging: (hexDragging) => set({ hexDragging }),
}));
