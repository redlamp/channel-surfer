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
  /** Tile the pin was placed on — pin-selects it: white outline, and
   * the inspector falls back to it when nothing is hovered. */
  pinnedTile: number | null;
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
  /** True while a drag hovers the dock zone — releasing would re-dock. */
  hexOverDock: boolean;
  /** Tile currently framed by focus mode, null when viewing the grid. */
  framedTile: number | null;
  /** Focus-mode isolation: hide the non-focused tiles while framed. */
  isolate: boolean;
  /** Overlay chrome occluding the display area (header height, open
   * panel width on wide windows, open sheet height on narrow ones), in
   * CSS px. Programmatic fits/frames center content in the unobstructed
   * region; manual panning may go under the chrome. */
  viewInsets: ViewInsets;
  setHoverColor: (c: SampledColor | null) => void;
  setPinnedColor: (c: SampledColor | null) => void;
  setPinnedTile: (tile: number | null) => void;
  setCanvasEl: (el: HTMLCanvasElement | null) => void;
  setHoverTile: (tile: number | null) => void;
  setFramedTile: (tile: number | null) => void;
  setIsolate: (on: boolean) => void;
  setHexWidget: (patch: Partial<UiState["hexWidget"]>) => void;
  setHexDragging: (on: boolean) => void;
  setHexOverDock: (on: boolean) => void;
  setViewInsets: (insets: ViewInsets) => void;
}

export interface ViewInsets {
  top: number;
  right: number;
  bottom: number;
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
  /** The 3x3 grid's current on-screen rect in DEVICE px (clamped to the
   * canvas), so PNG export can crop to the breakdown instead of the
   * whole full-bleed canvas with its letterbox and under-chrome areas. */
  gridScreenRect: null as
    | (() => { x: number; y: number; w: number; h: number } | null)
    | null,
  /** The hexagon hover card, positioned per-frame by the scene. */
  hexCardEl: null as HTMLDivElement | null,
  /** Tile under a canvas-relative CSS px point, or null off the grid.
   * Touch long-press needs this: a tap never produces a hover. */
  tileAtScreen: null as ((x: number, y: number) => number | null) | null,
  /** When a long-press last opened the effect menu; the click that
   * follows the release must not also pin. */
  longPressAt: 0,
  /** Live pointer count over the canvas (capture-phase tracked). */
  pointerCount: 0,
  /** True from the moment a second pointer joins until shortly after all
   * lift — suppresses loop drags and click-pins during two-finger pans. */
  multiTouch: false,
};

export const useUiStore = create<UiState>((set) => ({
  hoverColor: null,
  lastHoverColor: null,
  pinnedColor: null,
  pinnedTile: null,
  canvasEl: null,
  hoverTile: null,
  framedTile: null,
  isolate: false,
  hexWidget: { mode: "docked", size: 81, x: 24, y: 90 },
  hexDragging: false,
  hexOverDock: false,
  viewInsets: { top: 48, right: 0, bottom: 0 },
  setHoverColor: (hoverColor) =>
    set(hoverColor ? { hoverColor, lastHoverColor: hoverColor } : { hoverColor }),
  setPinnedColor: (pinnedColor) => set({ pinnedColor }),
  setPinnedTile: (pinnedTile) => set({ pinnedTile }),
  setCanvasEl: (canvasEl) => set({ canvasEl }),
  setHoverTile: (hoverTile) => set({ hoverTile }),
  setFramedTile: (framedTile) => set({ framedTile }),
  setIsolate: (isolate) => set({ isolate }),
  setHexWidget: (patch) =>
    set((s) => ({ hexWidget: { ...s.hexWidget, ...patch } })),
  setHexDragging: (hexDragging) => set({ hexDragging }),
  setHexOverDock: (hexOverDock) => set({ hexOverDock }),
  setViewInsets: (viewInsets) => set({ viewInsets }),
}));
