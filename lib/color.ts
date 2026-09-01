/**
 * The CPU side of the app's color math, in one place: the readout
 * conversions (0-255 sRGB in, rounded HSB/HSL/hex out), the sRGB <->
 * linear transfer functions the hexagon legend and the hue picker need,
 * and the unrounded hue the picker feeds the shader. The GLSL versions in
 * lib/shaders/breakdown.ts mirror these; keep the two in step.
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** sRGB transfer function, 0-1 in, 0-1 linear light out. */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Inverse transfer function, 0-1 linear light in, 0-1 sRGB out. */
export function linearToSrgb(v: number): number {
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

/**
 * Hue of an RGB triple as a fraction of a turn in [0, 1), or null for a
 * grey (undefined hue). Works on any consistent scale — 0-255 or 0-1 —
 * since only channel ratios matter.
 */
export function rgbHue01(r: number, g: number, b: number): number | null {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return null;
  let h: number;
  if (max === r) h = (g - b) / delta;
  else if (max === g) h = 2 + (b - r) / delta;
  else h = 4 + (r - g) / delta;
  h /= 6;
  return h < 0 ? h + 1 : h;
}

/**
 * Hue of an sRGB pixel computed in the space the tiles use: linear light
 * when the Gamma setting says so, raw sRGB otherwise. Null for greys.
 */
export function pixelHue(
  r8: number,
  g8: number,
  b8: number,
  linear: boolean,
): number | null {
  const cv = (v: number) => (linear ? srgbToLinear(v / 255) : v / 255);
  return rgbHue01(cv(r8), cv(g8), cv(b8));
}

/** Hue in whole degrees, 0 for greys. */
function hueDeg(r: number, g: number, b: number): number {
  const h = rgbHue01(r, g, b);
  return h === null ? 0 : Math.round(h * 360) % 360;
}

/** Hue 0-360, sat/brightness 0-100. */
export function rgbToHsb(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const s = max === 0 ? 0 : (delta / max) * 100;
  return {
    h: hueDeg(r, g, b),
    s: Math.round(s),
    b: Math.round((max / 255) * 100),
  };
}

/** Hue 0-360, sat/lightness 0-100. */
export function rgbToHsl(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2 / 255;
  const s = delta === 0 ? 0 : delta / 255 / (1 - Math.abs(2 * l - 1));
  return {
    h: hueDeg(r, g, b),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const to2 = (v: number) => v.toString(16).padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`.toUpperCase();
}
