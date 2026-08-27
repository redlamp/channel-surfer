"use client";

import { FlaskConical, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HelpTip } from "@/components/help-tip";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useSettingsStore,
  type ColorModel,
  type HighlightMode,
  type HueMapStyle,
} from "@/stores/settings-store";
import { Fragment } from "react";
import {
  COMPASS,
  LAYOUT_PRESETS,
  layoutHasTintGroup,
  TILE_TRANSFORMS,
  TRANSFORM_MENU,
  DEFAULT_LAYOUT,
  type TransformKey,
} from "@/lib/tile-transforms";

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
export function SettingsPanel({
  onClose,
  embedded = false,
}: {
  onClose: () => void;
  /** Rendered inside the inspector panel: the panel shell supplies the
   * frame and the tab bar stands in for the title/close header. */
  embedded?: boolean;
}) {
  const highlightMode = useSettingsStore((s) => s.highlightMode);
  const setHighlightMode = useSettingsStore((s) => s.setHighlightMode);
  const rgbColorize = useSettingsStore((s) => s.rgbColorize);
  const setRgbColorize = useSettingsStore((s) => s.setRgbColorize);
  const colorModel = useSettingsStore((s) => s.colorModel);
  const setColorModel = useSettingsStore((s) => s.setColorModel);
  const hueMapStyle = useSettingsStore((s) => s.hueMapStyle);
  const setHueMapStyle = useSettingsStore((s) => s.setHueMapStyle);
  const tileLayout = useSettingsStore((s) => s.tileLayout);
  const setTileTransform = useSettingsStore((s) => s.setTileTransform);
  const setTileLayout = useSettingsStore((s) => s.setTileLayout);
  const midLevel = useSettingsStore((s) => s.midLevel);
  const setMidLevel = useSettingsStore((s) => s.setMidLevel);
  const neutralTolerance = useSettingsStore((s) => s.neutralTolerance);
  const setNeutralTolerance = useSettingsStore((s) => s.setNeutralTolerance);
  const chromaColorize = useSettingsStore((s) => s.chromaColorize);
  const setChromaColorize = useSettingsStore((s) => s.setChromaColorize);
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
  const chromaSmooth = useSettingsStore((s) => s.chromaSmooth);
  const setChromaSmooth = useSettingsStore((s) => s.setChromaSmooth);

  return (
    <aside
      className={
        embedded
          ? "flex min-h-0 w-full flex-1 flex-col overflow-hidden"
          : "flex w-96 shrink-0 flex-col overflow-hidden rounded-md border border-border bg-card shadow-[var(--shadow-sm)]"
      }
    >
      {!embedded && (
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
      )}

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-3 py-4">
        <div className="space-y-2">
          <Label>
            Hue highlight on hover
            <HelpTip>
              Recalibrates the hue map so the hovered pixel&apos;s hue reads
              as white.
            </HelpTip>
          </Label>
          <Segmented
            value={highlightMode}
            options={HIGHLIGHT_OPTIONS}
            onChange={setHighlightMode}
          />
        </div>

        {labs && (
          <div className="space-y-2">
            <Label>
              <FlaskConical className="size-4" aria-hidden /> Hue map style
              <HelpTip>
                Twilight is the shipping style; the rest are experiments
                from the hue-direction research.
              </HelpTip>
            </Label>
            <Segmented
              value={hueMapStyle}
              options={HUE_STYLE_OPTIONS}
              onChange={setHueMapStyle}
            />
          </div>
        )}

        {labs && (
          <div className="space-y-2">
            <Label>
              <FlaskConical className="size-4" aria-hidden /> Tile effects
              <HelpTip>
                Any effect can sit on any tile.{" "}
                <strong className="font-semibold text-foreground">
                  Factorial
                </strong>{" "}
                is source / shaded / lit / flat — every combination of
                saturation and brightness kept or maxed — which costs
                the hue map its tile.
              </HelpTip>
            </Label>
            <div className="grid grid-cols-3 gap-1">
              {tileLayout.map((key, i) => (
                <div
                  key={COMPASS[i]}
                  className="flex flex-col gap-0.5 rounded-md border border-border bg-surface-inset p-1"
                >
                  <span className="font-mono text-base text-muted-foreground">
                    {COMPASS[i]}
                  </span>
                  <Select
                    value={key}
                    onValueChange={(v) =>
                      setTileTransform(i, v as TransformKey)
                    }
                  >
                    <SelectTrigger
                      size="sm"
                      aria-label={`Effect for the ${COMPASS[i]} tile`}
                      className="w-full min-w-0 border-0 px-1 dark:bg-transparent dark:hover:bg-transparent"
                    >
                      <SelectValue>
                        {(v: string) => (
                          <span className="truncate">
                            {TILE_TRANSFORMS[v as TransformKey]?.short ?? v}
                          </span>
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {/* Same order as the right-click menu. */}
                      {TRANSFORM_MENU.map((group, gi) => (
                        <Fragment key={group.label ?? "anchor"}>
                          {gi > 0 && <SelectSeparator />}
                          <SelectGroup>
                            {group.label && (
                              <SelectLabel>{group.label}</SelectLabel>
                            )}
                            {group.runs.map((run, ri) => (
                              <Fragment key={ri}>
                                {ri > 0 && <SelectSeparator />}
                                {run.map((k) => (
                                  <SelectItem
                                    key={k}
                                    value={k}
                                    title={TILE_TRANSFORMS[k].blurb}
                                  >
                                    {TILE_TRANSFORMS[k].name}
                                  </SelectItem>
                                ))}
                              </Fragment>
                            ))}
                          </SelectGroup>
                        </Fragment>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {LAYOUT_PRESETS.map((p) => (
                <Button
                  key={p.key}
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setTileLayout(p.layout)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            {tileLayout.includes("mid") && (
              <div className="space-y-1 pt-1">
                <div className="flex items-baseline justify-between">
                  <Label>
                    Mid level
                    <HelpTip>
                      The brightness every pixel is pinned to. Higher reads
                      punchier; past ~85% low-saturation areas start
                      blowing out to white.
                    </HelpTip>
                  </Label>
                  <span className="font-mono text-base text-muted-foreground">
                    {Math.round(midLevel * 100)}%
                  </span>
                </div>
                <Slider
                  min={10}
                  max={100}
                  step={1}
                  value={Math.round(midLevel * 100)}
                  onValueChange={(v) =>
                    setMidLevel((typeof v === "number" ? v : v[0]) / 100)
                  }
                />
              </div>
            )}
            <div className="space-y-1 pt-1">
              <div className="flex items-baseline justify-between">
                <Label>
                  Neutral tolerance
                  <HelpTip>
                    Chroma below this counts as grey, so it renders as a
                    neutral instead of a hue. Raise it on noisy JPEGs; 0
                    shows every pixel&rsquo;s hue, however faint.
                  </HelpTip>
                </Label>
                <span className="font-mono text-base text-muted-foreground">
                  {Math.round(neutralTolerance * 255)}/255
                </span>
              </div>
              <Slider
                min={0}
                max={24}
                step={1}
                value={Math.round(neutralTolerance * 255)}
                onValueChange={(v) =>
                  setNeutralTolerance(
                    (typeof v === "number" ? v : v[0]) / 255,
                  )
                }
              />
            </div>
          </div>
        )}

        {layoutHasTintGroup(tileLayout, "chroma") && (
          <div className="space-y-2">
            <Label>
              Tint (chroma tile)
              <HelpTip>
                White shows how much colour is present; Color tints that
                amount by its hue. Independent of the RGB channel tint.
              </HelpTip>
            </Label>
            <Segmented
              value={chromaColorize ? "color" : "gray"}
              options={[
                { value: "gray", label: "White" },
                { value: "color", label: "Color" },
              ]}
              onChange={(v) => setChromaColorize(v === "color")}
            />
          </div>
        )}

        <div className="space-y-2">
          <Label>
            Tint (RGB channel tiles)
            <HelpTip>
              The Tint bar under a hovered RGB tile toggles this too.
            </HelpTip>
          </Label>
          <Segmented
            value={rgbColorize ? "color" : "gray"}
            options={[
              { value: "gray", label: "Black to white" },
              { value: "color", label: "Black to color" },
            ]}
            onChange={(v) => setRgbColorize(v === "color")}
          />
        </div>

        <div className="space-y-2">
          <Label>
            Color model
            <HelpTip>
              Switches the saturation and brightness/lightness tiles and
              the readouts.
            </HelpTip>
          </Label>
          <Segmented
            value={colorModel}
            options={COLOR_MODEL_OPTIONS}
            onChange={setColorModel}
          />
        </div>

        <div className="space-y-2">
          <Label>
            RGB values
            <HelpTip>How the readout rows print RGB channels.</HelpTip>
          </Label>
          <Segmented
            value={rgbFloat ? "float" : "int"}
            options={[
              { value: "int", label: "0–255" },
              { value: "float", label: "0.0–1.0" },
            ]}
            onChange={(v) => setRgbFloat(v === "float")}
          />
        </div>

        <div className="space-y-2">
          <Label>
            Gamma
            <HelpTip>
              Which values the tile transforms run on. sRGB matches the
              readouts and most tools; linear light is the Gigi original.
            </HelpTip>
          </Label>
          <Segmented
            value={colorMath}
            options={[
              { value: "linear", label: "Linear" },
              { value: "srgb", label: "sRGB" },
            ]}
            onChange={setColorMath}
          />
        </div>

        {labs && (
          <div className="space-y-2">
            <Label>
              <FlaskConical className="size-4" aria-hidden /> Chroma smoothing
              <HelpTip>
                JPEGs usually store colour at half resolution (4:2:0),
                which the hue and saturation tiles expose as blocks when
                zoomed past 1:1. Smooth averages the stored colour across
                those blocks — brightness untouched, no detail
                invented.
              </HelpTip>
            </Label>
            <Segmented
              value={chromaSmooth ? "smooth" : "raw"}
              options={[
                { value: "raw", label: "Raw" },
                { value: "smooth", label: "Smooth" },
              ]}
              onChange={(v) => setChromaSmooth(v === "smooth")}
            />
          </div>
        )}

        {labs && (
          <div className="space-y-2">
            <Label>
              <FlaskConical className="size-4" aria-hidden /> Hexagon hover card
              <HelpTip>
                The hexagon as a hover card that follows the cursor over
                the tiles.
              </HelpTip>
            </Label>
            <Segmented
              value={showColorHexagon ? "show" : "hide"}
              options={[
                { value: "hide", label: "Hide" },
                { value: "show", label: "Show" },
              ]}
              onChange={(v) => setShowColorHexagon(v === "show")}
            />
          </div>
        )}

        <div className="space-y-2">
          <Label>
            Equations
            <HelpTip>
              The color-taylor hex and HSB/HSL derivation for the hovered
              pixel, below the canvas.
            </HelpTip>
          </Label>
          <Segmented
            value={showColorSteps ? "show" : "hide"}
            options={[
              { value: "hide", label: "Hide" },
              { value: "show", label: "Show" },
            ]}
            onChange={(v) => setShowColorSteps(v === "show")}
          />
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
            setTileLayout(DEFAULT_LAYOUT);
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
