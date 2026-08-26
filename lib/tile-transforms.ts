/**
 * The tile transform registry — one source of truth for what a tile can
 * show, shared by the shader, the tile-name widget, and the Labs layout
 * grid.
 *
 * Any of the nine grid positions can carry any transform, so adding a new
 * view is two edits: a branch in `applyTransform` in
 * `lib/shaders/breakdown.ts` keyed on the same `id`, and a row here.
 * Rearranging the grid is a change to `DEFAULT_LAYOUT` (or a click in the
 * Labs panel) and nothing else.
 */

export interface TileTransform {
  /** Shader-side id. Stable: the shader switches on this number. */
  id: number;
  /** Compact label for the narrow compass grid, where the full name
   * truncates to ambiguity ("Hue · f…" could be flat, and "Hue · l…"
   * could be lit). Kept to 8 characters. */
  short: string;
  /** Name shown in the tile title widget. */
  name: string;
  /** One-liner for the Labs picker. */
  blurb: string;
}

export const TILE_TRANSFORMS = {
  source: { id: 0, short: "Source", name: "Source", blurb: "Untouched" },
  shaded: {
    id: 1,
    short: "Shaded",
    name: "Hue · shaded",
    blurb: "Saturation maxed, brightness kept",
  },
  flat: {
    id: 2,
    short: "Flat",
    name: "Hue · flat",
    blurb: "Saturation and brightness both maxed; neutrals split at 50%",
  },
  flatSteps: {
    id: 19,
    short: "Flat·3",
    name: "Hue · flat · steps",
    blurb: "Flat, but neutrals posterize to black / grey / white (the Gigi original)",
  },
  lit: {
    id: 3,
    short: "Lit",
    name: "Hue · lit",
    blurb: "Saturation kept, brightness maxed",
  },
  mid: {
    id: 14,
    short: "Mid",
    name: "Hue · mid",
    blurb: "Saturation kept, brightness pinned to 50%",
  },
  satHsb: {
    id: 15,
    short: "S · HSB",
    name: "Saturation · HSB",
    blurb: "HSB saturation, pinned regardless of the Model toggle",
  },
  satHsl: {
    id: 16,
    short: "S · HSL",
    name: "Saturation · HSL",
    blurb: "HSL saturation, pinned regardless of the Model toggle",
  },
  valueHsb: {
    id: 17,
    short: "B · HSB",
    name: "Brightness · HSB",
    blurb: "HSB brightness, pinned regardless of the Model toggle",
  },
  lightHsl: {
    id: 18,
    short: "L · HSL",
    name: "Lightness · HSL",
    blurb: "HSL lightness, pinned regardless of the Model toggle",
  },
  hueMap: {
    id: 4,
    short: "Hue map",
    name: "Hue map",
    blurb: "Signed distance from the target hue",
  },
  saturation: { id: 5, short: "Sat", name: "Saturation", blurb: "Saturation as grey" },
  brightness: { id: 6, short: "Bright", name: "Brightness", blurb: "Brightness as grey" },
  red: { id: 7, short: "Red", name: "Red", blurb: "Red channel" },
  green: { id: 8, short: "Green", name: "Green", blurb: "Green channel" },
  blue: { id: 9, short: "Blue", name: "Blue", blurb: "Blue channel" },
  chroma: {
    id: 10,
    short: "Chroma",
    name: "Hue · chroma",
    blurb: "Hue, dimmed by how much colour is actually there",
  },
  families: {
    id: 11,
    short: "Families",
    name: "Hue families",
    blurb: "Hue snapped to the six primaries and secondaries",
  },
  warmCool: {
    id: 12,
    short: "Warmth",
    name: "Warm / cool",
    blurb: "The painter's single axis",
  },
  contours: {
    id: 13,
    short: "Contours",
    name: "Hue contours",
    blurb: "Lines where hue crosses each 30° boundary",
  },
} as const satisfies Record<string, TileTransform>;

export type TransformKey = keyof typeof TILE_TRANSFORMS;

export const TRANSFORM_KEYS = Object.keys(TILE_TRANSFORMS) as TransformKey[];

/** Nine grid positions, reading order (row-major from the top-left). */
export type TileLayout = readonly TransformKey[];

/** The shipping grid. */
export const DEFAULT_LAYOUT: TileLayout = [
  "source",
  "shaded",
  "flat",
  "hueMap",
  "saturation",
  "brightness",
  "red",
  "green",
  "blue",
];

/**
 * Named starting points for the Labs grid. "Factorial" is Taylor's
 * proposal: source / shaded / lit / flat are the four combinations of
 * {saturation kept, maxed} x {brightness kept, maxed}, which costs the
 * hue map its tile.
 */
export const LAYOUT_PRESETS: { key: string; label: string; layout: TileLayout }[] =
  [
    { key: "shipping", label: "Shipping", layout: DEFAULT_LAYOUT },
    {
      key: "factorial",
      label: "Factorial",
      layout: [
        "source",
        "shaded",
        "lit",
        "flat",
        "saturation",
        "brightness",
        "red",
        "green",
        "blue",
      ],
    },
    {
      key: "models",
      label: "HSB vs HSL",
      layout: [
        "source",
        "satHsl",
        "lightHsl",
        "hueMap",
        "satHsb",
        "valueHsb",
        "red",
        "green",
        "blue",
      ],
    },
  ];

/** Compass label for a grid position, for UI that names positions. */
export const COMPASS = [
  "NW",
  "N",
  "NE",
  "W",
  "C",
  "E",
  "SW",
  "S",
  "SE",
] as const;

/** Repairs a stored layout of the wrong length or with retired keys. */
export function normalizeLayout(layout: unknown): TransformKey[] {
  const fallback = [...DEFAULT_LAYOUT];
  if (!Array.isArray(layout)) return fallback;
  return fallback.map((def, i) => {
    const k = layout[i];
    return typeof k === "string" && k in TILE_TRANSFORMS
      ? (k as TransformKey)
      : def;
  });
}

/** Grid position currently showing the hue map, or -1. The hover
 * retargeting and the hexagon's legend ring follow it. */
export function hueMapTileIndex(layout: TileLayout): number {
  return layout.indexOf("hueMap");
}
