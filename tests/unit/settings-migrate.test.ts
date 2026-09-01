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
