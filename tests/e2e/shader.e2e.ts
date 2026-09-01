import { expect, test, type Page } from "@playwright/test";
import { rgbHue01, rgbToHsl } from "../../lib/color";
import type { TransformKey } from "../../lib/tile-transforms";

/**
 * Every tile effect, checked against the source pixels the app itself
 * shows. No image-specific expectations: the test reads the Source tile
 * at a set of points, computes what each effect must produce for those
 * exact pixels (the same maths as the shader, in TypeScript), and
 * compares it with the pixel the tile at the same position renders.
 *
 * Runs under the shipping settings (sRGB math, tint on for RGB, white
 * for chroma, neutral tolerance 5/255) and a second grid that covers the
 * rest of the library.
 */

type RGB = [number, number, number];
type Rect = { x: number; y: number; w: number; h: number };

const TOL = 4; // 8-bit texture round trip + interpolation
const NEUTRAL_TOL = 5 / 255;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/** GLSL hsv2rgb, 0-1 in and out. */
function hsv2rgb(h: number, s: number, v: number): RGB {
  if (s === 0) return [v, v, v];
  const hh = (((h % 1) + 1) % 1) * 6;
  const i = Math.floor(hh);
  const f = hh - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));
  switch (i) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}

/** The shader's colorfulness(): 1 for colour, 0 for neutral, or a
 * feathered value in between that the test treats as "skip". */
function colorfulness(c: RGB) {
  const chroma = (Math.max(...c) - Math.min(...c)) / 255;
  return smoothstep(NEUTRAL_TOL * 0.75, NEUTRAL_TOL * 1.5, chroma);
}

function hsv(c: RGB) {
  const max = Math.max(...c) / 255;
  const min = Math.min(...c) / 255;
  return {
    h: rgbHue01(c[0], c[1], c[2]) ?? 0,
    s: max === 0 ? 0 : (max - min) / max,
    v: max,
  };
}

const grey = (g: number): RGB => [g, g, g];
const to255 = (c: RGB): RGB => c.map((v) => v * 255) as RGB;

/**
 * Expected output of each effect for a source pixel, or null when the
 * point is ambiguous (inside the neutral feather, or on a hue-family
 * boundary) and should be skipped.
 */
function expected(key: TransformKey, src: RGB): RGB | null {
  const { h, s, v } = hsv(src);
  const cf = colorfulness(src);
  if (cf > 0 && cf < 1) return null;
  switch (key) {
    case "source": return src;
    case "red": return [src[0], 0, 0];
    case "green": return [0, src[1], 0];
    case "blue": return [0, 0, src[2]];
    case "saturation": return grey(s * 255);
    case "brightness": return grey(v * 255);
    case "chroma": return grey(s * v * 255);
    case "flatSteps":
      return cf ? to255(hsv2rgb(h, 1, 1)) : grey((v < 0.2 ? 0 : v < 0.8 ? 0.5 : 1) * 255);
    case "flat":
      return cf ? to255(hsv2rgb(h, 1, 1)) : grey(v < 0.5 ? 0 : 255);
    case "shaded": return to255(hsv2rgb(h, cf, v));
    case "lit": return to255(hsv2rgb(h, s * cf, 1));
    case "mid": return to255(hsv2rgb(h, s * cf, 0.7));
    case "families": {
      const f = (h * 6) % 1;
      if (f < 0.03 || f > 0.97) return null;
      return to255(hsv2rgb((Math.floor(h * 6) + 0.5) / 6, 1, cf));
    }
    case "satHsb": return grey(s * 255);
    case "valueHsb": return grey(v * 255);
    case "satHsl": return grey(rgbToHsl(src[0], src[1], src[2]).s * 2.55);
    case "lightHsl": return grey(rgbToHsl(src[0], src[1], src[2]).l * 2.55);
    default: return null;
  }
}

/** Fractions of a tile to sample, avoiding the outline and echo rings.
 * Points that land on an edge in the image are filtered out at run time
 * (see sampleTiles), so the grid is dense enough to survive that. */
const POINTS = [0.08, 0.2, 0.32, 0.44, 0.56, 0.68, 0.8, 0.92].flatMap((fx) =>
  [0.2, 0.35, 0.5, 0.62].map((fy) => ({ fx, fy })),
);

async function waitForGrid(page: Page): Promise<Rect> {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByText("Decoding image…")).toHaveCount(0, { timeout: 30_000 });
  // The grid rect exists once the scene has an image; a rendered frame
  // follows within a few animation frames.
  await page.waitForFunction(() => {
    const b = (window as unknown as {
      __channelSurfer?: { gridScreenRect?: () => Rect | null };
    }).__channelSurfer;
    return !!b?.gridScreenRect?.();
  });
  await page.waitForTimeout(500);
  return page.evaluate(() =>
    (window as unknown as {
      __channelSurfer: { gridScreenRect: () => Rect };
    }).__channelSurfer.gridScreenRect(),
  );
}

/**
 * Read one pixel per tile at the same fractional position, plus whether
 * the SOURCE tile is flat around that point. The grid is minified on a
 * 1280px viewport, so a point near an edge in the image lands on a
 * different texel blend in each tile (their screen positions round
 * differently); only flat patches compare cleanly across tiles.
 */
async function sampleTiles(page: Page, rect: Rect, fx: number, fy: number, sourceTile: number) {
  return page.evaluate(
    ({ rect, fx, fy, sourceTile }) => {
      const canvas = document.querySelector("canvas") as HTMLCanvasElement;
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      if (!gl) throw new Error("no gl context");
      const px = new Uint8Array(4);
      const read = (x: number, y: number) => {
        gl.readPixels(x, canvas.height - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return [px[0], px[1], px[2]] as [number, number, number];
      };
      const at = (tile: number) => {
        const col = tile % 3;
        const row = Math.floor(tile / 3);
        return {
          x: Math.round(rect.x + ((col + fx) * rect.w) / 3),
          y: Math.round(rect.y + ((row + fy) * rect.h) / 3),
        };
      };
      const tiles: [number, number, number][] = [];
      for (let tile = 0; tile < 9; tile++) {
        const p = at(tile);
        tiles.push(read(p.x, p.y));
      }
      const s = at(sourceTile);
      const center = tiles[sourceTile];
      let flat = true;
      for (let dx = -3; dx <= 3 && flat; dx++)
        for (let dy = -3; dy <= 3 && flat; dy++) {
          const c = read(s.x + dx, s.y + dy);
          if (Math.max(...c.map((v, i) => Math.abs(v - center[i]))) > 1) flat = false;
        }
      return { tiles, flat };
    },
    { rect, fx, fy, sourceTile },
  );
}

function expectClose(actual: RGB, want: RGB, label: string) {
  for (let i = 0; i < 3; i++) {
    expect(Math.abs(actual[i] - want[i]), `${label}: got ${actual} want ${want.map(Math.round)}`).toBeLessThanOrEqual(TOL);
  }
}

async function checkLayout(page: Page, layout: TransformKey[]) {
  const rect = await waitForGrid(page);
  const sourceTile = layout.indexOf("source");
  let checked = 0;
  for (const { fx, fy } of POINTS) {
    const { tiles, flat } = await sampleTiles(page, rect, fx, fy, sourceTile);
    if (!flat) continue;
    const src = tiles[sourceTile];
    for (let i = 0; i < 9; i++) {
      const want = expected(layout[i], src);
      if (!want) continue;
      expectClose(tiles[i], want, `${layout[i]} @ (${fx},${fy}) from ${src}`);
      checked++;
    }
  }
  // Guard against a silently blank canvas passing every skip.
  expect(checked).toBeGreaterThan(30);
}

const SHIPPING: TransformKey[] = [
  "source", "chroma", "warmCool", "flatSteps", "saturation", "brightness", "red", "green", "blue",
];
const LIBRARY: TransformKey[] = [
  "source", "shaded", "flat", "lit", "mid", "families", "satHsl", "lightHsl", "valueHsb",
];

test.describe("tile effects render the shader maths", () => {
  test("shipping grid", async ({ page }) => {
    await checkLayout(page, SHIPPING);
  });

  test("library effects", async ({ page }) => {
    await page.addInitScript((layout) => {
      localStorage.setItem(
        "channel-surfer:settings",
        JSON.stringify({ state: { tileLayout: layout, labs: true }, version: 8 }),
      );
    }, LIBRARY);
    await checkLayout(page, LIBRARY);
  });

  test("Tint off renders the RGB channels as grey", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "channel-surfer:settings",
        JSON.stringify({ state: { rgbColorize: false }, version: 8 }),
      );
    });
    const rect = await waitForGrid(page);
    const { tiles } = await sampleTiles(page, rect, 0.3, 0.5, 0);
    const src = tiles[0];
    expectClose(tiles[6], grey(src[0]), "red as grey");
    expectClose(tiles[7], grey(src[1]), "green as grey");
    expectClose(tiles[8], grey(src[2]), "blue as grey");
  });
});
