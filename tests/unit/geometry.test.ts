import { describe, expect, test } from "bun:test";
import type * as THREE from "three";
import {
  PLANE_H,
  barGroupOfTile,
  clearRegion,
  fitAllZoom,
  gridScreenRect,
  insetCenter,
  tileAtScreen,
  tileFromUv,
  tileRect,
  tileScreenBox,
} from "@/components/canvas/geometry";
import { DEFAULT_LAYOUT } from "@/lib/tile-transforms";

/** Enough of an OrthographicCamera for the screen-space helpers. */
const cam = (x: number, y: number, zoom: number) =>
  ({ zoom, position: { x, y } }) as unknown as THREE.OrthographicCamera;

const NO_INSETS = { top: 0, right: 0, bottom: 0 };

describe("tileFromUv", () => {
  test("reading order runs from the top-left", () => {
    expect(tileFromUv({ x: 0.1, y: 0.9 }).tile).toBe(0);
    expect(tileFromUv({ x: 0.5, y: 0.9 }).tile).toBe(1);
    expect(tileFromUv({ x: 0.9, y: 0.9 }).tile).toBe(2);
    expect(tileFromUv({ x: 0.1, y: 0.5 }).tile).toBe(3);
    expect(tileFromUv({ x: 0.9, y: 0.1 }).tile).toBe(8);
  });
  test("intra-tile uv is v-up and clamps at the far edge", () => {
    const t = tileFromUv({ x: 0.5, y: 0.5 });
    expect(t.u).toBeCloseTo(0.5);
    expect(t.v).toBeCloseTo(0.5);
    expect(tileFromUv({ x: 1, y: 1 }).tile).toBe(2);
  });
});

describe("tileRect", () => {
  test("tiles tile the plane", () => {
    const aspect = 16 / 9;
    for (let i = 0; i < 9; i++) {
      const r = tileRect(i, aspect);
      expect(r.w).toBeCloseTo((aspect * PLANE_H) / 3);
      expect(r.h).toBeCloseTo(PLANE_H / 3);
    }
    expect(tileRect(4, aspect)).toMatchObject({ cx: 0, cy: 0 });
    expect(tileRect(0, aspect).cy).toBeGreaterThan(0);
    expect(tileRect(0, aspect).cx).toBeLessThan(0);
  });
});

describe("fit and insets", () => {
  const size = { width: 1200, height: 800 };
  test("clearRegion subtracts every edge", () => {
    expect(clearRegion(size, { top: 50, right: 300, bottom: 100 })).toEqual({
      width: 900,
      height: 650,
    });
  });
  test("fitAllZoom is bounded by the tighter axis", () => {
    const wide = fitAllZoom(size, 3, NO_INSETS);
    const tall = fitAllZoom(size, 0.5, NO_INSETS);
    expect(wide).toBeCloseTo((1200 / 3) * 0.94);
    expect(tall).toBeCloseTo(800 * 0.94);
  });
  test("insetCenter pushes content away from the chrome", () => {
    const zoom = 100;
    const right = insetCenter(0, 0, zoom, { top: 0, right: 300, bottom: 0 });
    expect(right.x).toBeCloseTo(1.5);
    const top = insetCenter(0, 0, zoom, { top: 50, right: 0, bottom: 0 });
    expect(top.y).toBeCloseTo(0.25);
    const bottom = insetCenter(0, 0, zoom, { top: 0, right: 0, bottom: 50 });
    expect(bottom.y).toBeCloseTo(-0.25);
  });
  test("a fitted grid is centered in the clear region", () => {
    const insets = { top: 48, right: 352, bottom: 0 };
    const aspect = 16 / 9;
    const zoom = fitAllZoom(size, aspect, insets);
    const c = insetCenter(0, 0, zoom, insets);
    const box = tileScreenBox(4, aspect, cam(c.x, c.y, zoom), size);
    const clear = clearRegion(size, insets);
    expect((box.x0 + box.x1) / 2).toBeCloseTo(clear.width / 2, 6);
    expect((box.y0 + box.y1) / 2).toBeCloseTo(insets.top + clear.height / 2, 6);
  });
});

describe("screen mapping", () => {
  const size = { width: 1000, height: 600 };
  const aspect = 2;
  const camera = cam(0, 0, 200);
  test("tileScreenBox and tileAtScreen agree", () => {
    for (let i = 0; i < 9; i++) {
      const b = tileScreenBox(i, aspect, camera, size);
      const mx = (b.x0 + b.x1) / 2;
      const my = (b.y0 + b.y1) / 2;
      expect(tileAtScreen(mx, my, aspect, camera, size)).toBe(i);
    }
  });
  test("tileAtScreen is null off the grid", () => {
    expect(tileAtScreen(5, 5, aspect, camera, size)).toBeNull();
    expect(tileAtScreen(995, 595, aspect, camera, size)).toBeNull();
  });
  test("gridScreenRect clamps to the canvas in device px", () => {
    const full = gridScreenRect(aspect, camera, size, 2)!;
    expect(full).toEqual({ x: 600, y: 400, w: 800, h: 400 });
    const zoomed = gridScreenRect(aspect, cam(0, 0, 2000), size, 1)!;
    expect(zoomed).toEqual({ x: 0, y: 0, w: 1000, h: 600 });
    expect(gridScreenRect(aspect, cam(100, 0, 200), size, 1)).toBeNull();
  });
});

test("barGroupOfTile knows the warm/cool bar", () => {
  expect(barGroupOfTile(DEFAULT_LAYOUT, 2)).toBe("warmcool");
  expect(barGroupOfTile(DEFAULT_LAYOUT, 1)).toBe("chroma");
  expect(barGroupOfTile(DEFAULT_LAYOUT, 8)).toBe("rgb");
  expect(barGroupOfTile(DEFAULT_LAYOUT, 0)).toBeNull();
});
