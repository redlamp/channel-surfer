"use client";

import type { CSSProperties, ReactNode } from "react";
import { rgbToHex, rgbToHsb, rgbToHsl } from "@/lib/color";
import { useSettingsStore } from "@/stores/settings-store";
import { useUiStore } from "@/stores/ui-store";

/* Channel ink colors, from color-taylor's EquationsPanel (dark theme). */
const RC = "#ff4444";
const GC = "#44ee44";
const BC = "rgb(96, 96, 255)";
const MAXC = "#ff44ff";
const MINC = "#44ffff";
const CHRC = "#eebb22";

const pad = (v: number | string) => String(v).padStart(3, " ");

function Box({
  title,
  value,
  children,
}: {
  title: string;
  value?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-card p-2 shadow-[var(--shadow-sm)]">
      <div className="flex items-baseline justify-between">
        <span className="font-sans text-base font-semibold text-foreground">
          {title}
        </span>
        {value && (
          <span className="text-base font-semibold text-foreground">
            {value}
          </span>
        )}
      </div>
      <hr className="border-border" />
      {children}
    </div>
  );
}

const emph: CSSProperties = {
  textDecorationLine: "underline",
  textDecorationColor: "white",
  textUnderlineOffset: "2px",
  textDecorationThickness: "2px",
};

/**
 * The color-taylor "steps": how the hovered pixel's RGB values derive its
 * hex, hue, saturation, and brightness/lightness. Trimmed port of
 * EquationsPanel, driven by the live hover sample (pin as fallback).
 */
export function ColorSteps() {
  const show = useSettingsStore((s) => s.showColorSteps);
  const colorModel = useSettingsStore((s) => s.colorModel);
  const hoverColor = useUiStore((s) => s.hoverColor);
  const pinnedColor = useUiStore((s) => s.pinnedColor);
  const lastHoverColor = useUiStore((s) => s.lastHoverColor);

  if (!show) return null;
  // Always rendered while enabled — holding the last sample keeps the
  // layout stable instead of the panel popping in and out with hover.
  const sample = hoverColor ??
    pinnedColor ??
    lastHoverColor ?? { r: 128, g: 128, b: 128 };

  const { r, g, b } = sample;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const maxKey = max === r ? "r" : max === g ? "g" : "b";
  const hex = rgbToHex(r, g, b);
  const hsb = rgbToHsb(r, g, b);
  const hsl = rgbToHsl(r, g, b);
  const l255 = Math.round((max + min) / 2);
  const maxChroma = Math.round((1 - Math.abs((2 * l255) / 255 - 1)) * 255);

  const rv = <span style={{ color: RC }}>{pad(r)}</span>;
  const gv = <span style={{ color: GC }}>{pad(g)}</span>;
  const bv = <span style={{ color: BC }}>{pad(b)}</span>;
  const maxV = (
    <span style={{ color: MAXC }} className="font-bold">
      {pad(max)}
    </span>
  );
  const minV = (
    <span style={{ color: MINC }} className="font-bold">
      {pad(min)}
    </span>
  );
  const chrV = <span style={{ color: CHRC }}>{pad(delta)}</span>;

  const hueRow = (key: "r" | "g" | "b", body: ReactNode) => (
    <span className={maxKey === key ? "" : "opacity-30"}>
      {body}
      {maxKey === key && (
        <>
          {" "}
          = <span style={emph}>{hsb.h}°</span>
        </>
      )}
    </span>
  );

  return (
    <div className="grid w-full grid-cols-1 gap-2 font-mono text-base text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
      <Box title="Variables">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span
            className="rounded px-1.5"
            style={{
              backgroundColor: hex,
              color: r * 0.299 + g * 0.587 + b * 0.114 > 150 ? "#000" : "#fff",
            }}
          >
            {hex}
          </span>
          <span>
            rgb({rv}, {gv}, {bv})
          </span>
        </div>
        <span>
          <span style={{ color: MAXC }}>max</span>: {maxV}{" "}
          <span style={{ color: MINC }}>min</span>: {minV}
        </span>
        <span>
          <span style={{ color: CHRC }}>chroma</span>: {maxV}-{minV} = {chrV}
        </span>
      </Box>

      <Box title="Hue" value={`${hsb.h}°`}>
        {hueRow(
          "r",
          <>
            <span style={{ color: RC }}>H</span>: 60(({gv}-{bv})/{chrV}%6)
          </>,
        )}
        {hueRow(
          "g",
          <>
            <span style={{ color: GC }}>H</span>: 60(({bv}-{rv})/{chrV}+2)
          </>,
        )}
        {hueRow(
          "b",
          <>
            <span style={{ color: BC }}>H</span>: 60(({rv}-{gv})/{chrV}+4)
          </>,
        )}
      </Box>

      {colorModel === "hsb" ? (
        <Box title="Saturation" value={`${hsb.s}%`}>
          <span>
            S: {chrV}/{maxV} = <span style={emph}>{hsb.s}%</span>
          </span>
        </Box>
      ) : (
        <Box title="Saturation" value={`${hsl.s}%`}>
          <span>
            L: ({maxV}+{minV})/2 = {pad(l255)}
          </span>
          <span>
            MC: 1-|2·{pad(l255)}/255-1| = {pad(maxChroma)}
          </span>
          <span>
            S: {chrV}/{pad(maxChroma)} = <span style={emph}>{hsl.s}%</span>
          </span>
        </Box>
      )}

      {colorModel === "hsb" ? (
        <Box title="Brightness" value={`${hsb.b}%`}>
          <span>
            B: {maxV}/255 = <span style={emph}>{hsb.b}%</span>
          </span>
        </Box>
      ) : (
        <Box title="Lightness" value={`${hsl.l}%`}>
          <span>
            L: {pad(l255)}/255 = <span style={emph}>{hsl.l}%</span>
          </span>
        </Box>
      )}
    </div>
  );
}
