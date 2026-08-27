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

/** Which Tint control governs an effect. */
export type TintGroup = "rgb" | "chroma";

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
  /** Effect renders a magnitude that can be shown bare or tinted. The
   * group names which Tint control owns it — the RGB channels and chroma
   * are toggled independently. */
  tint?: TintGroup;
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
  red: { tint: "rgb", id: 7, short: "Red", name: "Red", blurb: "Red channel" },
  green: { tint: "rgb", id: 8, short: "Green", name: "Green", blurb: "Green channel" },
  blue: { tint: "rgb", id: 9, short: "Blue", name: "Blue", blurb: "Blue channel" },
  chroma: {
    tint: "chroma",
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

/** The shipping grid (Taylor's 2026-08-27 picks — note the hue map is
 * no longer part of it; it remains in the library and the HSB vs HSL
 * preset). */
export const DEFAULT_LAYOUT: TileLayout = [
  "source",
  "chroma",
  "warmCool",
  "flatSteps",
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

/**
 * Presentation order for the effect pickers (the right-click menu and
 * the Settings compass dropdowns): groups in the order the default grid
 * reads, the effects that ship in that grid leading each group, and the
 * model-pinned pairs / research pieces trailing after a thin divider.
 * Spatial memory stays stable — nothing reorders based on use.
 */
export interface TransformMenuGroup {
  /** Group heading, or null for the anchor row (Source). */
  label: string | null;
  /** Runs of effects; consecutive runs are split by a thin divider. */
  runs: TransformKey[][];
}

export const TRANSFORM_MENU: TransformMenuGroup[] = [
  { label: null, runs: [["source"]] },
  {
    label: "Hue",
    runs: [
      ["warmCool", "chroma", "flatSteps"],
      ["shaded", "flat", "lit", "mid", "families", "contours", "hueMap"],
    ],
  },
  {
    label: "Saturation / Brightness",
    runs: [
      ["saturation", "brightness"],
      ["satHsb", "satHsl", "valueHsb", "lightHsl"],
    ],
  },
  { label: "RGB", runs: [["red", "green", "blue"]] },
];

// A registry entry missing from the menu would be unpickable — warn in
// dev rather than silently hiding it.
if (process.env.NODE_ENV !== "production") {
  const menuKeys = TRANSFORM_MENU.flatMap((g) => g.runs.flat());
  if (
    menuKeys.length !== TRANSFORM_KEYS.length ||
    TRANSFORM_KEYS.some((k) => !menuKeys.includes(k))
  )
    console.warn("TRANSFORM_MENU is out of sync with TILE_TRANSFORMS");
}

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

/** Which Tint control the effect at this grid position answers to, if any. */
export function tintGroupOfTile(
  layout: TileLayout,
  tile: number,
): TintGroup | null {
  const key = layout[tile];
  if (key === undefined) return null;
  // The `as const` narrows each entry to its literal shape, so entries
  // without the optional field do not carry the key at all.
  return (TILE_TRANSFORMS[key] as TileTransform).tint ?? null;
}

/** Whether any grid position is showing an effect in this tint group. */
export function layoutHasTintGroup(
  layout: TileLayout,
  group: TintGroup,
): boolean {
  return layout.some(
    (k) => (TILE_TRANSFORMS[k] as TileTransform).tint === group,
  );
}

/** Grid position currently showing the hue map, or -1. The hover
 * retargeting and the hexagon's legend ring follow it. */
export function hueMapTileIndex(layout: TileLayout): number {
  return layout.indexOf("hueMap");
}
