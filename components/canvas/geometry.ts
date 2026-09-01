/**
 * Pure geometry for the breakdown canvas: how the 3x3 grid plane maps to
 * tiles, to intra-tile UVs, and to the screen under the orthographic
 * camera. No React, no three.js objects beyond the camera it is handed.
 */
import type * as THREE from "three";
import { tintGroupOfTile, type TileLayout, type TintGroup } from "@/lib/tile-transforms";

/** World-space height of the 3x3 grid plane; width is aspect x this. */
export const PLANE_H = 1;
/** Fit-all leaves a little air around the grid. */
export const FIT_MARGIN = 0.94;
/** Framed-tile margin: slivers of the neighbors stay visible so they can
 * be double-clicked directly. */
export const FRAME_MARGIN = 0.88;
/** Resting hue-map target: 180 degrees. */
export const DEFAULT_TARGET_HUE = 0.5;
/** A click that waits this long with no second click is a single click. */
export const CLICK_DELAY_MS = 250;
/** How long the context bar survives the cursor crossing the gap to reach it. */
export const TINT_BAR_GRACE_MS = 300;
/** Right-button travel (px) still counted as a click, not a pan. */
export const RMB_SLOP = 4;

export const HUE_STYLE_INDEX = {
  warmcool: 0,
  glow: 1,
  twilight: 2,
  diamond: 3,
  crawl: 4,
} as const;

export type CanvasCursor = "reticle" | "grabbing" | "hidden";

export interface ViewGoal {
  x: number;
  y: number;
  zoom: number;
}

/** Overlay chrome the fit should avoid (header, open panel). */
export type ViewInsets = { top: number; right: number };

export type ScreenSize = { width: number; height: number };

/** Which context bar the effect at a grid position gets: a Tint bar
 * (RGB channels or chroma), the warm/cool Shade bar, or none. */
export type BarGroup = TintGroup | "warmcool";
export function barGroupOfTile(layout: TileLayout, tile: number): BarGroup | null {
  if (layout[tile] === "warmCool") return "warmcool";
  return tintGroupOfTile(layout, tile);
}

export function fitAllZoom(size: ScreenSize, aspect: number, insets: ViewInsets) {
  return (
    Math.min(
      (size.width - insets.right) / (aspect * PLANE_H),
      (size.height - insets.top) / PLANE_H,
    ) * FIT_MARGIN
  );
}

/** Camera position that centers world point (cx, cy) in the region the
 * chrome leaves clear. Screen +y is down and world +y is up, so both
 * offsets ADD: the camera looks above-right of the content, pushing it
 * down-left on screen, out from under the header and panel. */
export function insetCenter(cx: number, cy: number, zoom: number, insets: ViewInsets) {
  return {
    x: cx + insets.right / (2 * zoom),
    y: cy + insets.top / (2 * zoom),
  };
}

/** Center and size of a tile (0..8, row-major from top-left) in world units. */
export function tileRect(tile: number, aspect: number) {
  const w = aspect * PLANE_H;
  const h = PLANE_H;
  const col = tile % 3;
  const row = Math.floor(tile / 3);
  return {
    cx: -w / 2 + ((col + 0.5) * w) / 3,
    cy: h / 2 - ((row + 0.5) * h) / 3,
    w: w / 3,
    h: h / 3,
  };
}

/** Tile index + intra-tile UV (v up) from a whole-plane UV. */
export function tileFromUv(uv: { x: number; y: number }) {
  const gx = Math.min(Math.floor(uv.x * 3), 2);
  const gyFromBottom = Math.min(Math.floor(uv.y * 3), 2);
  return {
    tile: (2 - gyFromBottom) * 3 + gx,
    u: uv.x * 3 - gx,
    v: uv.y * 3 - gyFromBottom,
  };
}

/** A tile's edges on screen in CSS px, for the DOM overlays that park
 * beside tiles. */
export function tileScreenBox(
  tile: number,
  aspect: number,
  camera: THREE.OrthographicCamera,
  size: ScreenSize,
) {
  const r = tileRect(tile, aspect);
  const z = camera.zoom;
  return {
    x0: (r.cx - r.w / 2 - camera.position.x) * z + size.width / 2,
    x1: (r.cx + r.w / 2 - camera.position.x) * z + size.width / 2,
    y0: -(r.cy + r.h / 2 - camera.position.y) * z + size.height / 2,
    y1: -(r.cy - r.h / 2 - camera.position.y) * z + size.height / 2,
  };
}

/** The whole grid's on-screen rect in DEVICE px, clamped to the canvas,
 * or null if none of it is visible. PNG export crops to this. */
export function gridScreenRect(
  aspect: number,
  camera: THREE.OrthographicCamera,
  size: ScreenSize,
  dpr: number,
) {
  const w = aspect * PLANE_H;
  const h = PLANE_H;
  const left = ((-w / 2 - camera.position.x) * camera.zoom + size.width / 2) * dpr;
  const top = ((camera.position.y - h / 2) * camera.zoom + size.height / 2) * dpr;
  const width = w * camera.zoom * dpr;
  const height = h * camera.zoom * dpr;
  const x0 = Math.max(left, 0);
  const y0 = Math.max(top, 0);
  const x1 = Math.min(left + width, size.width * dpr);
  const y1 = Math.min(top + height, size.height * dpr);
  if (x1 - x0 < 1 || y1 - y0 < 1) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
