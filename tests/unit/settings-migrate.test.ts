import { describe, expect, test } from "bun:test";
import { DEFAULT_LAYOUT } from "@/lib/tile-transforms";
import { SETTINGS_VERSION, migrateSettings } from "@/stores/settings-migrate";

describe("migrateSettings", () => {
  test("a v0 blob picks up every one-time default flip", () => {
    const s = migrateSettings(
      { highlightMode: "all", hueMapStyle: "bands", rgbColorize: false },
      0,
    );
    expect(s.highlightMode).toBe("tile");
    expect(s.hueMapStyle).toBe("twilight");
    expect(s.rgbColorize).toBe(true);
    expect(s.colorMath).toBe("srgb");
    expect(s.chromaSmooth).toBe(false);
    expect(s.tileLayout).toEqual([...DEFAULT_LAYOUT]);
    expect(s.chromaColorize).toBe(false);
    expect(s.warmCoolShade).toBe(true);
  });

  test("current-version blobs are left alone apart from layout repair", () => {
    const layout = [...DEFAULT_LAYOUT].reverse();
    const s = migrateSettings(
      { highlightMode: "all", hueMapStyle: "crawl", colorMath: "linear", tileLayout: layout },
      SETTINGS_VERSION,
    );
    expect(s.highlightMode).toBe("all");
    expect(s.hueMapStyle).toBe("crawl");
    expect(s.colorMath).toBe("linear");
    expect(s.tileLayout).toEqual(layout);
  });

  test("retired effect keys degrade to the shipping effect for that slot", () => {
    const s = migrateSettings(
      { tileLayout: ["source", "gone", "red"] },
      SETTINGS_VERSION,
    );
    expect(s.tileLayout[1]).toBe(DEFAULT_LAYOUT[1]);
    expect(s.tileLayout).toHaveLength(9);
  });

  test("v7 keeps a custom hue style but resets the grid once", () => {
    const s = migrateSettings({ hueMapStyle: "glow", tileLayout: ["red"] }, 7);
    expect(s.hueMapStyle).toBe("glow");
    expect(s.tileLayout).toEqual([...DEFAULT_LAYOUT]);
  });
});


test("v8 hue variants migrate independently without changing their appearance", () => {
  const s = migrateSettings({ tileLayout: ["source", "shaded", "flat", "lit", "mid"], midLevel: 0.42 }, 8);
  expect(s.tileLayout.slice(0, 5)).toEqual(["source", "hue", "hue", "hue", "hue"]);
  expect(s.hueTiles.slice(1, 5)).toEqual([
    { saturation: 1, flat: false, brightness: 1 },
    { saturation: 1, flat: true, brightness: 1 },
    { saturation: "original", flat: true, brightness: 1 },
    { saturation: "original", flat: true, brightness: 0.42 },
  ]);
});


test("v9 saturation presets migrate to slider values", () => {
  const s = migrateSettings({ hueTiles: [
    { saturation: "mid", flat: true, brightness: 0.6 },
    { saturation: "high", flat: false, brightness: 1 },
    { saturation: "original", flat: true, brightness: 0.7 },
  ] }, 9);
  expect(s.hueTiles.map((h) => h.saturation)).toEqual([0.5, 1, "original"]);
});
