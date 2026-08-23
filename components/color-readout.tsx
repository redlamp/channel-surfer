"use client";

import { useEffect, useState } from "react";
import { Crosshair, MapPin } from "lucide-react";
import { rgbToHex, rgbToHsb, rgbToHsl } from "@/lib/color";
import { useSettingsStore } from "@/stores/settings-store";
import { useUiStore, type SampledColor } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

/* Channel ink colors, matching the color-steps panel. */
const BAR_CLASSES = {
  r: "bg-[#ff4444]",
  g: "bg-[#44ee44]",
  b: "bg-[rgb(96,96,255)]",
  neutral: "bg-foreground/60",
} as const;

/** A value with a magnitude bar underneath (the Gigi comp treatment). */
function ValueCell({
  text,
  frac,
  widthCh,
  bar,
}: {
  text: string;
  frac: number;
  widthCh: number;
  bar: keyof typeof BAR_CLASSES;
}) {
  return (
    <span
      className="flex shrink-0 flex-col gap-px"
      style={{ width: `${widthCh}ch` }}
    >
      <span className="text-right leading-tight text-muted-foreground">
        {text}
      </span>
      <span className="h-[3px] w-full overflow-hidden rounded-full bg-muted">
        <span
          className={cn("block h-full rounded-full", BAR_CLASSES[bar])}
          style={{ width: `${Math.round(Math.min(Math.max(frac, 0), 1) * 100)}%` }}
        />
      </span>
    </span>
  );
}

function ReadoutRow({
  sample,
  icon,
  title,
}: {
  sample: SampledColor | null;
  icon: React.ReactNode;
  title: string;
}) {
  const colorModel = useSettingsStore((s) => s.colorModel);
  const rgbFloat = useSettingsStore((s) => s.rgbFloat);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 900);
    return () => window.clearTimeout(t);
  }, [copied]);

  // Render an invisible placeholder row when absent so the header never
  // changes height as samples come and go.
  const { r, g, b } = sample ?? { r: 0, g: 0, b: 0 };
  const hex = rgbToHex(r, g, b);
  const fmt = (v: number) => (rgbFloat ? (v / 255).toFixed(3) : String(v));
  const rgbWidth = rgbFloat ? 5 : 3;
  const hsx =
    colorModel === "hsb"
      ? (() => {
          const { h, s, b: v } = rgbToHsb(r, g, b);
          return { label: "HSB", h, s, x: v };
        })()
      : (() => {
          const { h, s, l } = rgbToHsl(r, g, b);
          return { label: "HSL", h, s, x: l };
        })();

  return (
    <button
      type="button"
      title={`${title} — copy hex`}
      disabled={!sample}
      onClick={() => {
        void navigator.clipboard?.writeText(hex).then(() => setCopied(true));
      }}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-md px-2 py-0.5 font-mono text-base whitespace-pre transition-colors hover:bg-muted",
        sample ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span
        className="size-4 shrink-0 rounded-sm border border-border"
        style={{ backgroundColor: hex }}
      />
      <span className="w-[7ch] text-left">{copied ? "Copied!" : hex}</span>
      <span className="font-bold">RGB</span>
      <ValueCell text={fmt(r)} frac={r / 255} widthCh={rgbWidth} bar="r" />
      <ValueCell text={fmt(g)} frac={g / 255} widthCh={rgbWidth} bar="g" />
      <ValueCell text={fmt(b)} frac={b / 255} widthCh={rgbWidth} bar="b" />
      <span className="font-bold">{hsx.label}</span>
      <ValueCell
        text={`${hsx.h}°`}
        frac={hsx.h / 360}
        widthCh={4}
        bar="neutral"
      />
      <ValueCell
        text={`${hsx.s}%`}
        frac={hsx.s / 100}
        widthCh={4}
        bar="neutral"
      />
      <ValueCell
        text={`${hsx.x}%`}
        frac={hsx.x / 100}
        widthCh={4}
        bar="neutral"
      />
    </button>
  );
}

/** Header readout: pinned sample and live hover sample as two stable
 * rows; clicking a row copies its hex. */
export function ColorReadout() {
  const hoverColor = useUiStore((s) => s.hoverColor);
  const pinnedColor = useUiStore((s) => s.pinnedColor);

  return (
    <div className="flex flex-col items-end gap-0.5">
      <ReadoutRow
        sample={pinnedColor}
        icon={<MapPin className="size-4" aria-hidden />}
        title="Pinned color"
      />
      <ReadoutRow
        sample={hoverColor}
        icon={<Crosshair className="size-4" aria-hidden />}
        title="Hovered color"
      />
    </div>
  );
}
