import { describe, expect, test } from "bun:test";
import {
  linearToSrgb,
  pixelHue,
  rgbHue01,
  rgbToHex,
  rgbToHsb,
  rgbToHsl,
  srgbToLinear,
} from "@/lib/color";

describe("rgbToHsb", () => {
  test("primaries and secondaries land on the six hue landmarks", () => {
    expect(rgbToHsb(255, 0, 0)).toEqual({ h: 0, s: 100, b: 100 });
    expect(rgbToHsb(255, 255, 0)).toEqual({ h: 60, s: 100, b: 100 });
    expect(rgbToHsb(0, 255, 0)).toEqual({ h: 120, s: 100, b: 100 });
    expect(rgbToHsb(0, 255, 255)).toEqual({ h: 180, s: 100, b: 100 });
    expect(rgbToHsb(0, 0, 255)).toEqual({ h: 240, s: 100, b: 100 });
    expect(rgbToHsb(255, 0, 255)).toEqual({ h: 300, s: 100, b: 100 });
  });

  test("greys have zero saturation and hue 0", () => {
    expect(rgbToHsb(0, 0, 0)).toEqual({ h: 0, s: 0, b: 0 });
    expect(rgbToHsb(128, 128, 128)).toEqual({ h: 0, s: 0, b: 50 });
    expect(rgbToHsb(255, 255, 255)).toEqual({ h: 0, s: 0, b: 100 });
  });

  test("SMPTE 75% yellow reads 60° / 100% / 75%", () => {
    expect(rgbToHsb(191, 191, 0)).toEqual({ h: 60, s: 100, b: 75 });
  });

  test("hue never reports 360", () => {
    // Just shy of red on the magenta side rounds to 0, not 360.
    expect(rgbToHsb(255, 0, 1).h).toBe(0);
  });
});

describe("rgbToHsl", () => {
  test("lightness sits at the mid-point of max and min", () => {
    expect(rgbToHsl(255, 0, 0)).toEqual({ h: 0, s: 100, l: 50 });
    expect(rgbToHsl(191, 191, 0)).toEqual({ h: 60, s: 100, l: 37 });
    expect(rgbToHsl(128, 128, 128)).toEqual({ h: 0, s: 0, l: 50 });
  });

  test("pale colours saturate more under HSL than HSB", () => {
    const hsb = rgbToHsb(235, 200, 185);
    const hsl = rgbToHsl(235, 200, 185);
    expect(hsl.s).toBeGreaterThan(hsb.s);
    expect(hsl.h).toBe(hsb.h);
  });
});

describe("rgbHue01 / pixelHue", () => {
  test("returns null for greys", () => {
    expect(rgbHue01(10, 10, 10)).toBeNull();
    expect(pixelHue(0, 0, 0, true)).toBeNull();
  });

  test("hue is scale-invariant", () => {
    expect(rgbHue01(255, 128, 0)).toBeCloseTo(rgbHue01(1, 128 / 255, 0)!, 10);
  });

  test("linear-light hue differs from sRGB hue for mixed colours", () => {
    const srgb = pixelHue(200, 100, 50, false)!;
    const lin = pixelHue(200, 100, 50, true)!;
    expect(Math.abs(srgb - lin)).toBeGreaterThan(0.005);
  });
});

describe("transfer functions", () => {
  test("round-trip", () => {
    for (const v of [0, 0.001, 0.04, 0.2, 0.5, 0.9, 1]) {
      expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, 9);
    }
  });
  test("mid grey is darker in linear light", () => {
    expect(srgbToLinear(0.5)).toBeCloseTo(0.214, 3);
  });
});

test("rgbToHex", () => {
  expect(rgbToHex(0, 191, 0)).toBe("#00BF00");
  expect(rgbToHex(255, 255, 255)).toBe("#FFFFFF");
  expect(rgbToHex(0, 0, 0)).toBe("#000000");
});
