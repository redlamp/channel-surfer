"use client";

import { useEffect, useState } from "react";
import { Circle } from "lucide-react";
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

/** The app's gap-center reticle (the canvas cursor asset), as an icon —
 * not lucide's circled crosshair. */
function ReticleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <path d="M16 2v7M16 23v7M2 16h7M23 16h7" />
    </svg>
  );
}

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
  /** Live sample, or null — a null row renders blank but keeps its
   * space, so the header's visual targets never move. */
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

  const has = sample !== null;
  const { r, g, b } = sample ?? { r: 0, g: 0, b: 0 };
  const hex = rgbToHex(r, g, b);
  const fmt = (v: number) =>
    has ? (rgbFloat ? (v / 255).toFixed(3) : String(v)) : "";
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
      disabled={!has}
      onClick={() => {
        void navigator.clipboard?.writeText(hex).then(() => setCopied(true));
      }}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-md px-2 py-0.5 font-mono text-base whitespace-pre transition-opacity hover:bg-muted",
        has ? "opacity-100" : "pointer-events-none opacity-60",
      )}
    >
      <span className="text-muted-foreground">{icon}</span>
      {/* Empty state keeps the swatch outlined and shows a dimmed "#",
          so the space reads as a waiting slot rather than a gap. */}
      <span
        className={cn(
          "size-4 shrink-0 rounded-sm border",
          has ? "border-border" : "border-muted-foreground/60",
        )}
        style={{ backgroundColor: has ? hex : "transparent" }}
      />
      <span className="w-[7ch] text-left">
        {copied ? (
          "Copied!"
        ) : has ? (
          hex
        ) : (
          <span className="text-muted-foreground/70">#</span>
        )}
      </span>
      <span className="font-bold">RGB</span>
      <ValueCell text={fmt(r)} frac={has ? r / 255 : 0} widthCh={rgbWidth} bar="r" />
      <ValueCell text={fmt(g)} frac={has ? g / 255 : 0} widthCh={rgbWidth} bar="g" />
      <ValueCell text={fmt(b)} frac={has ? b / 255 : 0} widthCh={rgbWidth} bar="b" />
      <span className="font-bold">{hsx.label}</span>
      <ValueCell
        text={has ? `${hsx.h}°` : ""}
        frac={has ? hsx.h / 360 : 0}
        widthCh={4}
        bar="neutral"
      />
      <ValueCell
        text={has ? `${hsx.s}%` : ""}
        frac={has ? hsx.s / 100 : 0}
        widthCh={4}
        bar="neutral"
      />
      <ValueCell
        text={has ? `${hsx.x}%` : ""}
        frac={has ? hsx.x / 100 : 0}
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
        icon={<Circle className="size-4" aria-hidden />}
        title="Pinned color"
      />
      <ReadoutRow
        sample={hoverColor}
        icon={<ReticleIcon className="size-4" />}
        title="Hovered color"
      />
    </div>
  );
}
