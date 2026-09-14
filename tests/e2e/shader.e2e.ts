import { expect, test, type Page } from "@playwright/test";
import { rgbHue01, rgbToHsl } from "../../lib/color";
import type { HueSettings, TransformKey } from "../../lib/tile-transforms";

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
function expected(key: TransformKey, src: RGB, hue: HueSettings = { saturation: 1, flat: false, brightness: 1 }): RGB | null {
  const { h, s, v } = hsv(src);
  const cf = colorfulness(src);
  if (cf > 0 && cf < 1) return null;
  switch (key) {
    case "hue": {
      const saturation = hue.saturation === "original" ? s : hue.saturation;
      const brightness = hue.flat ? hue.brightness : v;
      return cf ? to255(hsv2rgb(h, saturation, brightness)) : grey(brightness * 255);
    }
    case "source": return src;
    case "red": return [src[0], 0, 0];
    case "green": return [0, src[1], 0];
    case "blue": return [0, 0, src[2]];
    case "saturation": return grey(s * 255);
    case "brightness": return grey(v * 255);
    case "chroma": return grey(s * v * 255);
    case "flatSteps":
      return cf ? to255(hsv2rgb(h, 1, 1)) : grey((v < 0.2 ? 0 : v < 0.8 ? 0.5 : 1) * 255);
    // Saved Flat tiles migrate to Hue; neutral brightness now stays uniform.
    case "flat": return cf ? to255(hsv2rgb(h, 1, 1)) : grey(255);
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

/** The WebGL canvas — not the hexagon widget's 2D one. */
const GL_CANVAS = '[data-canvas="breakdown"] canvas';

async function waitForGrid(page: Page): Promise<Rect> {
  await page.goto("/");
  // Generous: the dev server may be recompiling after an edit.
  await expect(page.locator(GL_CANVAS)).toBeVisible({ timeout: 30_000 });
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
      const canvas = document.querySelector(
        '[data-canvas="breakdown"] canvas',
      ) as HTMLCanvasElement;
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


test("Hue controls change only their own tile and persist", async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem("channel-surfer:settings")) return;
    localStorage.setItem("channel-surfer:settings", JSON.stringify({ version: 8,
      state: { tileLayout: ["source", "shaded", "shaded", "flatSteps", "saturation", "brightness", "red", "green", "blue"] } }));
  });
  let rect = await waitForGrid(page);
  await page.mouse.move(rect.x + rect.w / 2, rect.y + rect.h / 6);
  const controls = page.getByRole("group", { name: "Hue controls", exact: true });
  await expect(controls).toBeVisible();
  await controls.getByRole("slider", { name: "Saturation", exact: true }).fill("50");
  await controls.getByRole("checkbox", { name: "Uniform brightness", exact: true }).check();
  await controls.getByRole("slider", { name: "Brightness" }).fill("60");
  await page.mouse.move(1, 790);
  await page.waitForTimeout(150);
  for (const afterReload of [false, true]) {
    if (afterReload) rect = await waitForGrid(page);
    let checked = 0;
    for (const { fx, fy } of POINTS) {
      const { tiles, flat } = await sampleTiles(page, rect, fx, fy, 0);
      if (!flat) continue;
      const want = expected("hue", tiles[0], { saturation: 0.5, flat: true, brightness: 0.6 });
      const unchanged = expected("hue", tiles[0]);
      if (!want || !unchanged) continue;
      expectClose(tiles[1], want, "adjusted Hue");
      expectClose(tiles[2], unchanged, "independent Hue");
      checked++;
    }
    expect(checked).toBeGreaterThan(3);
  }
  await page.mouse.move(rect.x + rect.w / 2, rect.y + rect.h / 6);
  await expect(controls.getByRole("slider", { name: "Saturation", exact: true })).toHaveValue("50");
  await expect(controls.getByRole("slider", { name: "Brightness", exact: true })).toHaveValue("60");
  for (const channel of ["saturation", "brightness"] as const) {
    const readout = controls.getByTestId(`hue-${channel}-value`);
    const slider = controls.getByRole("slider", { name: channel === "saturation" ? "Saturation" : "Brightness", exact: true });
    const initialBox = await readout.boundingBox();
    for (const value of ["0", "9", "42", "100"]) {
      await slider.fill(value);
      await expect(readout).toHaveText(`${value}%`);
      const box = await readout.boundingBox();
      expect(box?.width).toBe(initialBox?.width);
      expect(box?.x).toBe(initialBox?.x);
    }
  }
  const uniformSaturation = controls.getByRole("checkbox", { name: "Uniform saturation", exact: true });
  await expect(uniformSaturation).toBeChecked();
  await uniformSaturation.uncheck();
  await expect(controls.getByRole("slider", { name: "Saturation", exact: true })).toBeDisabled();
  await uniformSaturation.check();
  await expect(controls.getByRole("slider", { name: "Saturation", exact: true })).toBeEnabled();
  await controls.getByRole("slider", { name: "Saturation", exact: true }).fill("37");
  await controls.getByRole("slider", { name: "Brightness", exact: true }).fill("9");
  for (const channel of ["saturation", "brightness"] as const) {
    const toggle = controls.getByRole("checkbox", { name: `Uniform ${channel}`, exact: true });
    const slider = controls.getByRole("slider", { name: channel === "saturation" ? "Saturation" : "Brightness", exact: true });
    await toggle.uncheck();
    await expect(slider).toBeDisabled();
    await toggle.check();
    await expect(slider).toHaveValue(channel === "saturation" ? "37" : "9");
  }
  await page.screenshot({ path: "test-results/hue-controls.png" });
});


test("Hue saturation and brightness combinations render correctly", async ({ page }) => {
  const hueTiles: HueSettings[] = [
    { saturation: 1, flat: false, brightness: 1 },
    { saturation: 0.37, flat: false, brightness: 0.4 },
    { saturation: 1, flat: true, brightness: 0.3 },
    { saturation: "original", flat: false, brightness: 0.6 },
    { saturation: 0, flat: true, brightness: 1 },
    { saturation: 1, flat: false, brightness: 0 },
    { saturation: "original", flat: true, brightness: 0.2 },
    { saturation: 1, flat: false, brightness: 0.5 },
    { saturation: 0.99, flat: true, brightness: 0.3 },
  ];
  await page.addInitScript((hueTiles) => {
    localStorage.setItem("channel-surfer:settings", JSON.stringify({ version: 9,
      state: { tileLayout: ["source", ...Array(8).fill("hue")], hueTiles } }));
  }, hueTiles);
  const rect = await waitForGrid(page);
  let checked = 0;
  let neutralEndpoints = 0;
  for (const { fx, fy } of POINTS) {
    const { tiles, flat } = await sampleTiles(page, rect, fx, fy, 0);
    if (!flat) continue;
    if (colorfulness(tiles[0]) === 0) {
      expectClose(tiles[2], tiles[8], "neutral brightness is unchanged from 99% to 100% saturation");
      neutralEndpoints++;
    }
    for (let tile = 1; tile < 9; tile++) {
      const want = expected("hue", tiles[0], hueTiles[tile]);
      if (!want) continue;
      expectClose(tiles[tile], want, `Hue combination ${tile}`);
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(30);
  expect(neutralEndpoints).toBeGreaterThan(0);
});


test("Hue panel stays attached while crossing the gap above another control tile", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("channel-surfer:settings", JSON.stringify({ version: 8,
      state: { tileLayout: ["source", "shaded", "source", "source", "chroma", "source", "red", "green", "blue"] } }));
  });
  const rect = await waitForGrid(page);
  const x = rect.x + rect.w / 2;
  const bottom = rect.y + rect.h / 3;
  await page.mouse.move(x, bottom - 15);
  const controls = page.getByRole("group", { name: "Hue controls", exact: true });
  await expect(controls).toBeVisible();
  await page.mouse.move(x, bottom + 4, { steps: 12 });
  await page.waitForTimeout(450);
  await expect(controls).toBeVisible();
  await controls.getByRole("slider", { name: "Saturation", exact: true }).fill("50");
  await expect(controls.getByRole("slider", { name: "Saturation", exact: true })).toHaveValue("50");
  await page.mouse.move(1, 790);
  await expect(controls).toBeHidden();
});


test("library opens on the left independently of inspector and settings", async ({ page }) => {
  const initialRect = await waitForGrid(page);
  const library = page.getByRole("complementary", { name: "Media library", exact: true });
  const inspector = page.getByRole("complementary", { name: "Inspector and settings", exact: true });
  await expect(inspector).toBeVisible();
  await expect(inspector.getByRole("button", { name: "Library", exact: true })).toHaveCount(0);
  await inspector.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Open media library", exact: true }).click();
  await expect(library).toBeVisible();
  await expect(inspector).toBeVisible();
  await expect(inspector.getByRole("button", { name: "Settings", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await library.boundingBox())?.x).toBe(12);
  const left = (await library.boundingBox())!;
  const right = (await inspector.boundingBox())!;
  expect(left.x).toBe(12);
  expect(left.x + left.width).toBeLessThan(right.x);
  const readRect = () => page.evaluate(() =>
    (window as unknown as { __channelSurfer: { gridScreenRect: () => Rect } }).__channelSurfer.gridScreenRect());
  await page.waitForTimeout(250);
  expect(await readRect()).toEqual(initialRect);
  const leftToggle = (await page.locator('[aria-controls="media-library"]').boundingBox())!;
  const rightToggle = (await page.locator('[aria-controls="inspector-panel"]').boundingBox())!;
  expect(Math.abs(leftToggle.x - (left.x + left.width))).toBeLessThanOrEqual(2);
  expect(Math.abs(rightToggle.x + rightToggle.width - right.x)).toBeLessThanOrEqual(2);
  // Click the exposed background above the image, between the panels.
  await page.mouse.dblclick(620, initialRect.y - 12);
  await expect.poll(async () => {
    const rect = await readRect();
    return rect.x >= 312 && rect.x + rect.w <= 928;
  }).toBe(true);
  // Allow the explicit refit tween to finish before checking toggle stability.
  await page.waitForTimeout(1500);
  const fittedRect = await readRect();
  await page.screenshot({ path: "test-results/library-left.png" });
  await page.getByRole("button", { name: "Close panel", exact: true }).click();
  await expect(inspector).toBeHidden();
  await expect(library).toBeVisible();
  await page.waitForTimeout(250);
  const afterClose = await readRect();
  expect(afterClose.x).toBeCloseTo(fittedRect.x, 1);
  expect(afterClose.w).toBeCloseTo(fittedRect.w, 1);
  await library.getByRole("button", { name: "Close media library", exact: true }).click();
  await expect(library).toBeHidden();
  await page.getByRole("button", { name: "Open panel", exact: true }).click();
  await expect(inspector.getByRole("button", { name: "Settings", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("narrow screens show one panel at a time", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await waitForGrid(page);
  const library = page.getByRole("complementary", { name: "Media library", exact: true });
  const inspector = page.getByRole("complementary", { name: "Inspector and settings", exact: true });
  await page.getByRole("button", { name: "Open panel", exact: true }).click();
  await expect(inspector).toBeVisible();
  await page.getByRole("button", { name: "Open media library", exact: true }).click();
  await expect(library).toBeVisible();
  await expect(inspector).toBeHidden();
  await page.waitForTimeout(200);
  const box = (await library.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/library-mobile.png" });
  await page.getByRole("button", { name: "Open panel", exact: true }).click();
  await expect(inspector).toBeVisible();
  await expect(library).toBeHidden();
});


test("header names, selected controls, and zoom actions", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("channel-surfer:settings", JSON.stringify({ version: 8,
    state: { tileLayout: ["source", "shaded", "source", "source", "chroma", "source", "red", "green", "blue"] } })));
  const initial = await waitForGrid(page);
  await page.getByRole("button", { name: "Show tile names", exact: true }).click();
  await expect(page.locator("[data-tile-name]")).toHaveCount(9);
  const title = page.locator('[data-tile-name="1"]');
  await expect(title).toBeVisible();
  const box = (await title.boundingBox())!;
  expect(box.x + box.width / 2).toBeCloseTo(initial.x + initial.w / 2, 0);
  expect(box.y).toBeCloseTo(initial.y + 8, 0);
  await page.mouse.move(initial.x + initial.w / 2, initial.y + initial.h / 6);
  await page.getByRole("button", { name: "Show selected tile controls", exact: true }).click();
  const inspector = page.getByRole("complementary", { name: "Inspector and settings", exact: true });
  const controls = inspector.getByRole("group", { name: "Hue controls", exact: true });
  await expect(controls).toBeVisible();
  await controls.getByRole("slider", { name: "Saturation", exact: true }).fill("42");
  await expect(controls.getByTestId("hue-saturation-value")).toHaveText("42%");
  const read = () => page.evaluate(() => (window as unknown as { __channelSurfer: { gridScreenRect: () => Rect } }).__channelSurfer.gridScreenRect());
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect.poll(async () => (await read()).w).toBeLessThan(initial.w);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  expect((await read()).w).toBeCloseTo(initial.w, 0);
  await page.getByRole("button", { name: "Actual size", exact: true }).click();
  expect((await read()).h).toBeGreaterThan(initial.h);
  await page.getByRole("button", { name: "Fit image", exact: true }).click();
  await expect.poll(async () => { const r = await read(); return r.x + r.w <= 928; }).toBe(true);
  await page.waitForTimeout(600);
  await page.screenshot({ path: "test-results/header-controls.png" });
});

test("PNG export contains the full grid regardless of camera and panels", async ({ page }) => {
  await waitForGrid(page);
  const exportPixels = (names = false) => page.evaluate(async ({ names }) => {
    const bridge = (window as unknown as { __channelSurfer: { exportGrid: (size: number, names: boolean) => Promise<Blob> } }).__channelSurfer;
    const bitmap = await createImageBitmap(await bridge.exportGrid(1536, names));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d")!; ctx.drawImage(bitmap, 0, 0); bitmap.close();
    const points = [0.15, 0.3, 0.45, 0.6, 0.75].map((fx) => Array.from({ length: 9 }, (_, tile) => {
      const x = Math.floor((tile % 3 + fx) * canvas.width / 3);
      const y = Math.floor((Math.floor(tile / 3) + 0.35) * canvas.height / 3);
      return Array.from(ctx.getImageData(x, y, 1, 1).data).slice(0, 3);
    }));
    return { width: canvas.width, height: canvas.height, points,
      title: Array.from(ctx.getImageData(canvas.width / 6, 20, 1, 1).data) };
  }, { names });
  const first = await exportPixels();
  expect(first.width).toBe(1536); expect(first.height).toBe(864);
  let checks = 0;
  for (const tiles of first.points) {
    for (let tile = 0; tile < 9; tile++) {
      const want = expected(SHIPPING[tile], tiles[0] as RGB);
      if (!want) continue;
      expectClose(tiles[tile] as RGB, want, `export tile ${tile}`); checks++;
    }
  }
  expect(checks).toBeGreaterThan(20);
  await page.getByRole("button", { name: "Actual size", exact: true }).click();
  await page.getByRole("button", { name: "Open media library", exact: true }).click();
  const second = await exportPixels();
  expect(second).toEqual(first);
  const labelled = await exportPixels(true);
  expect(labelled.title).not.toEqual(first.title);
  await page.getByRole("button", { name: "Export breakdown as PNG", exact: true }).click();
  await page.getByRole("combobox", { name: "Export size" }).selectOption("1536");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save PNG", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/channel-surfer-.*\.png$/);
});
