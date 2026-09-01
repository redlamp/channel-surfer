import { describe, expect, test } from "bun:test";
import {
  DEFAULT_LAYOUT,
  LAYOUT_PRESETS,
  TILE_TRANSFORMS,
  TRANSFORM_KEYS,
  TRANSFORM_MENU,
  hueMapTileIndex,
  layoutHasTintGroup,
  normalizeLayout,
  tintGroupOfTile,
} from "@/lib/tile-transforms";

describe("registry", () => {
  test("shader ids are unique and never renumbered", () => {
    const ids = TRANSFORM_KEYS.map((k) => TILE_TRANSFORMS[k].id);
    expect(new Set(ids).size).toBe(ids.length);
    // Pin the ids that persisted layouts and the shader dispatcher rely
    // on. Adding an effect appends a NEW id; it never reuses one.
    expect(TILE_TRANSFORMS.source.id).toBe(0);
    expect(TILE_TRANSFORMS.hueMap.id).toBe(4);
    expect(TILE_TRANSFORMS.red.id).toBe(7);
    expect(TILE_TRANSFORMS.chroma.id).toBe(10);
    expect(TILE_TRANSFORMS.flatSteps.id).toBe(19);
  });

  test("short labels fit the compass grid", () => {
    for (const k of TRANSFORM_KEYS) {
      expect(TILE_TRANSFORMS[k].short.length).toBeLessThanOrEqual(8);
    }
  });

  test("every effect is reachable from the pickers exactly once", () => {
    const menuKeys = TRANSFORM_MENU.flatMap((g) => g.runs.flat());
    expect([...menuKeys].sort()).toEqual([...TRANSFORM_KEYS].sort());
  });

  test("layouts and presets are nine valid keys", () => {
    for (const layout of [DEFAULT_LAYOUT, ...LAYOUT_PRESETS.map((p) => p.layout)]) {
      expect(layout).toHaveLength(9);
      for (const k of layout) expect(k in TILE_TRANSFORMS).toBe(true);
    }
  });
});

describe("normalizeLayout", () => {
  test("passes a valid layout through", () => {
    const l = [...DEFAULT_LAYOUT].reverse();
    expect(normalizeLayout(l)).toEqual(l);
  });
  test("repairs retired keys and wrong lengths position by position", () => {
    const broken = ["source", "noSuchEffect", "red"];
    const fixed = normalizeLayout(broken);
    expect(fixed).toHaveLength(9);
    expect(fixed[0]).toBe("source");
    expect(fixed[1]).toBe(DEFAULT_LAYOUT[1]);
    expect(fixed[2]).toBe("red");
    expect(fixed.slice(3)).toEqual(DEFAULT_LAYOUT.slice(3));
  });
  test("non-arrays fall back to the shipping grid", () => {
    expect(normalizeLayout(undefined)).toEqual([...DEFAULT_LAYOUT]);
    expect(normalizeLayout("red")).toEqual([...DEFAULT_LAYOUT]);
  });
});

describe("layout queries", () => {
  test("tint groups travel with the effect", () => {
    expect(tintGroupOfTile(DEFAULT_LAYOUT, 6)).toBe("rgb");
    expect(tintGroupOfTile(DEFAULT_LAYOUT, 1)).toBe("chroma");
    expect(tintGroupOfTile(DEFAULT_LAYOUT, 0)).toBeNull();
    expect(tintGroupOfTile(DEFAULT_LAYOUT, 42)).toBeNull();
    expect(layoutHasTintGroup(DEFAULT_LAYOUT, "chroma")).toBe(true);
    expect(layoutHasTintGroup(["source"], "rgb")).toBe(false);
  });
  test("the hue map is found wherever it sits", () => {
    expect(hueMapTileIndex(DEFAULT_LAYOUT)).toBe(-1);
    const models = LAYOUT_PRESETS.find((p) => p.key === "models")!.layout;
    expect(models[hueMapTileIndex(models)]).toBe("hueMap");
  });
});
