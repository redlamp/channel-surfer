"use client";

import { FlaskConical, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import {
  useSettingsStore,
  type ColorModel,
  type HighlightMode,
  type HueMapStyle,
} from "@/stores/settings-store";

const HIGHLIGHT_OPTIONS: { value: HighlightMode; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "tile", label: "Hue tile" },
  { value: "all", label: "All tiles" },
];

const COLOR_MODEL_OPTIONS: { value: ColorModel; label: string }[] = [
  { value: "hsb", label: "HSB" },
  { value: "hsl", label: "HSL" },
];

const HUE_STYLE_OPTIONS: { value: HueMapStyle; label: string }[] = [
  { value: "warmcool", label: "Warm/cool" },
  { value: "twilight", label: "Twilight" },
  { value: "glow", label: "Glow" },
  { value: "diamond", label: "Diamond" },
  { value: "crawl", label: "Crawl" },
];

/**
 * Settings as an inline sidebar, a sibling of the Media Library panel —
 * both can be open side by side, and the canvas stays interactive so
 * settings are judged live.
 */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const highlightMode = useSettingsStore((s) => s.highlightMode);
  const setHighlightMode = useSettingsStore((s) => s.setHighlightMode);
  const rgbColorize = useSettingsStore((s) => s.rgbColorize);
  const setRgbColorize = useSettingsStore((s) => s.setRgbColorize);
  const colorModel = useSettingsStore((s) => s.colorModel);
  const setColorModel = useSettingsStore((s) => s.setColorModel);
  const hueMapStyle = useSettingsStore((s) => s.hueMapStyle);
  const setHueMapStyle = useSettingsStore((s) => s.setHueMapStyle);
  const showColorSteps = useSettingsStore((s) => s.showColorSteps);
  const setShowColorSteps = useSettingsStore((s) => s.setShowColorSteps);
  const rgbFloat = useSettingsStore((s) => s.rgbFloat);
  const setRgbFloat = useSettingsStore((s) => s.setRgbFloat);
  const labs = useSettingsStore((s) => s.labs);
  const setLabs = useSettingsStore((s) => s.setLabs);
  const showColorHexagon = useSettingsStore((s) => s.showColorHexagon);
  const setShowColorHexagon = useSettingsStore((s) => s.setShowColorHexagon);
  const colorMath = useSettingsStore((s) => s.colorMath);
  const setColorMath = useSettingsStore((s) => s.setColorMath);

  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-hidden rounded-md border border-border bg-card shadow-[var(--shadow-sm)]">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-base font-semibold">Settings</h2>
        <button
          type="button"
          aria-label="Close settings"
          className="cursor-pointer select-none rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-3 py-4">
        <div className="space-y-2">
          <Label>Hue highlight on hover</Label>
          <Segmented
            value={highlightMode}
            options={HIGHLIGHT_OPTIONS}
            onChange={setHighlightMode}
          />
          <p className="text-base text-muted-foreground">
            Recalibrates the hue map so the hovered pixel&apos;s hue reads as
            white.
          </p>
        </div>

        {labs && (
          <div className="space-y-2">
            <Label>
              <FlaskConical className="size-4" aria-hidden /> Hue map style
            </Label>
            <Segmented
              value={hueMapStyle}
              options={HUE_STYLE_OPTIONS}
              onChange={setHueMapStyle}
            />
            <p className="text-base text-muted-foreground">
              Twilight is the shipping style; the rest are experiments from
              the hue-direction research.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label>Tint (RGB channel tiles)</Label>
          <Segmented
            value={rgbColorize ? "color" : "gray"}
            options={[
              { value: "gray", label: "Black to white" },
              { value: "color", label: "Black to color" },
            ]}
            onChange={(v) => setRgbColorize(v === "color")}
          />
          <p className="text-base text-muted-foreground">
            The Tint bar under a hovered RGB tile toggles this too.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Color model</Label>
          <Segmented
            value={colorModel}
            options={COLOR_MODEL_OPTIONS}
            onChange={setColorModel}
          />
          <p className="text-base text-muted-foreground">
            Switches the saturation and brightness/lightness tiles and the
            readouts.
          </p>
        </div>

        <div className="space-y-2">
          <Label>RGB values</Label>
          <Segmented
            value={rgbFloat ? "float" : "int"}
            options={[
              { value: "int", label: "0–255" },
              { value: "float", label: "0.0–1.0" },
            ]}
            onChange={(v) => setRgbFloat(v === "float")}
          />
          <p className="text-base text-muted-foreground">
            How the readout rows print RGB channels.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Gamma</Label>
          <Segmented
            value={colorMath}
            options={[
              { value: "linear", label: "Linear" },
              { value: "srgb", label: "sRGB" },
            ]}
            onChange={setColorMath}
          />
          <p className="text-base text-muted-foreground">
            Which values the tile transforms run on. sRGB matches the
            readouts and most tools; linear light is the Gigi original.
          </p>
        </div>

        {labs && (
          <div className="space-y-2">
            <Label>
              <FlaskConical className="size-4" aria-hidden /> Hexagon hover
              card
            </Label>
            <Segmented
              value={showColorHexagon ? "show" : "hide"}
              options={[
                { value: "hide", label: "Hide" },
                { value: "show", label: "Show" },
              ]}
              onChange={(v) => setShowColorHexagon(v === "show")}
            />
            <p className="text-base text-muted-foreground">
              The hexagon as a hover card that follows the cursor over the
              tiles.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label>Equations</Label>
          <Segmented
            value={showColorSteps ? "show" : "hide"}
            options={[
              { value: "hide", label: "Hide" },
              { value: "show", label: "Show" },
            ]}
            onChange={(v) => setShowColorSteps(v === "show")}
          />
          <p className="text-base text-muted-foreground">
            The color-taylor hex and HSB/HSL derivation for the hovered
            pixel, below the canvas.
          </p>
        </div>
      </div>

      <div className="flex gap-2 border-t border-border px-3 py-2">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => {
            setHighlightMode("tile");
            setRgbColorize(true);
            setColorModel("hsb");
            setHueMapStyle("twilight");
            setShowColorSteps(false);
            setRgbFloat(false);
            setShowColorHexagon(false);
            setColorMath("srgb");
          }}
        >
          Reset to defaults
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle Labs (experimental options)"
          title="Labs — experimental options"
          aria-pressed={labs}
          className={labs ? "text-foreground" : "text-muted-foreground"}
          onClick={() => setLabs(!labs)}
        >
          <FlaskConical aria-hidden />
        </Button>
      </div>
    </aside>
  );
}
