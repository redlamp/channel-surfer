"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { rgbToHex, rgbToHsb, rgbToHsl } from "@/lib/color";
import { useSettingsStore } from "@/stores/settings-store";
import { useUiStore, type SampledColor } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

function ColorChip({
  sample,
  pinned,
}: {
  sample: SampledColor;
  pinned?: boolean;
}) {
  const colorModel = useSettingsStore((s) => s.colorModel);
  const [copied, setCopied] = useState(false);
  const { r, g, b } = sample;
  const hex = rgbToHex(r, g, b);
  const model =
    colorModel === "hsb"
      ? (() => {
          const { h, s, b: v } = rgbToHsb(r, g, b);
          return `HSB ${h}° ${s}% ${v}%`;
        })()
      : (() => {
          const { h, s, l } = rgbToHsl(r, g, b);
          return `HSL ${h}° ${s}% ${l}%`;
        })();

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 900);
    return () => window.clearTimeout(t);
  }, [copied]);

  return (
    <button
      type="button"
      title="Copy hex"
      onClick={() => {
        void navigator.clipboard?.writeText(hex).then(() => setCopied(true));
      }}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-md border border-border px-2 py-1 font-mono text-base transition-colors hover:bg-muted",
        pinned ? "bg-surface-inset" : "bg-transparent",
      )}
    >
      {pinned && <MapPin className="size-4 text-muted-foreground" aria-hidden />}
      <span
        className="size-4 shrink-0 rounded-sm border border-border"
        style={{ backgroundColor: hex }}
      />
      {copied ? (
        <span className="text-muted-foreground">Copied!</span>
      ) : (
        <>
          <span>{hex}</span>
          <span className="text-muted-foreground">
            RGB {r} {g} {b}
          </span>
          <span className="text-muted-foreground">{model}</span>
        </>
      )}
    </button>
  );
}

/** Header readout: live hover sample plus the pinned sample, hex first;
 * clicking a chip copies its hex. */
export function ColorReadout() {
  const hoverColor = useUiStore((s) => s.hoverColor);
  const pinnedColor = useUiStore((s) => s.pinnedColor);

  if (!hoverColor && !pinnedColor) return null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {pinnedColor && <ColorChip sample={pinnedColor} pinned />}
      {hoverColor && <ColorChip sample={hoverColor} />}
    </div>
  );
}
