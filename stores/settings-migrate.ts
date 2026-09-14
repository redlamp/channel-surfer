import { DEFAULT_LAYOUT, normalizeLayout, LEGACY_HUE_KEYS, hueSettingsFor } from "@/lib/tile-transforms";
import type { SettingsState } from "@/stores/settings-store";

/** Persisted-settings schema version. Bump when a default must change
 * ONCE for existing users; additive fields need no bump. */
export const SETTINGS_VERSION = 10;

/**
 * Upgrades a persisted settings blob from `version` to the current
 * schema. Kept apart from the store so it can be unit-tested without
 * spinning up zustand's persistence.
 *
 * v1: default highlightMode changed "all" -> "tile". v2: the static
 * "bands" hue-map style became the animated "crawl". v3: twilight won
 * the style bake-off and becomes the default once for everyone; the
 * other styles live behind the Labs flag. v4: black-to-color tint
 * becomes the default once. v5: gamma followed the image ("auto"). v6:
 * auto is gone — those settings move to sRGB, now the default. v7:
 * chroma smoothing demoted to Labs — reset once so nobody keeps an
 * invisible effect switched on from testing. v8: the 2026-08-27
 * shipping grid (chroma/warm-cool up top, hue map retired from the
 * default) plus white chroma tint and shaded warm/cool become the
 * defaults once for everyone. v9: the four Hue variants become independently
 * adjustable Hue tiles, preserving the previous settings for each position.
 */
export function migrateSettings(persisted: unknown, version: number) {
  const state = persisted as Omit<Partial<SettingsState>, "hueMapStyle"> & {
    hueMapStyle?: string;
  };
  if (version === 0) state.highlightMode = "tile";
  if (version <= 1 && state.hueMapStyle === "bands") state.hueMapStyle = "crawl";
  if (version <= 2) state.hueMapStyle = "twilight";
  if (version <= 3) state.rgbColorize = true;
  if (version <= 5) state.colorMath = "srgb";
  if (version <= 6) state.chromaSmooth = false;
  if (version <= 7) {
    state.tileLayout = [...DEFAULT_LAYOUT];
    state.chromaColorize = false;
    state.warmCoolShade = true;
  }
  // Layouts are stored as effect keys, so a retired or renamed effect
  // falls back to whatever ships in that position.
  state.tileLayout = normalizeLayout(state.tileLayout);
  if (version <= 8) {
    state.hueTiles = state.tileLayout.map((key) => hueSettingsFor(key, state.midLevel));
    state.tileLayout = state.tileLayout.map((key) => LEGACY_HUE_KEYS.includes(key) ? "hue" : key);
  }
  if (version === 9 && Array.isArray(state.hueTiles)) {
    state.hueTiles = state.hueTiles.map((h) => {
      const saturation: unknown = h.saturation;
      return { ...h, saturation: saturation === "mid" ? 0.5 : saturation === "high" ? 1 : h.saturation };
    });
  }
  return state as SettingsState;
}
