"use client";

import { useEffect, useState } from "react";
import { Crosshair, MapPin } from "lucide-react";
import { rgbToHex, rgbToHsb, rgbToHsl } from "@/lib/color";
import { useSettingsStore } from "@/stores/settings-store";
import { useUiStore, type SampledColor } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

/** Fixed-width number so changing digit counts never shifts the row. */
const pad = (v: number, width = 3) => String(v).padStart(width, " ");

function ReadoutRow({
  sample,
  icon,
  title,
}: {
  sample: SampledColor | null;
  icon: ReturnType<typeof Crosshair> extends never ? never : React.ReactNode;
  title: string;
}) {
  const colorModel = useSettingsStore((s) => s.colorModel);
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
  const model =
    colorModel === "hsb"
      ? (() => {
          const { h, s, b: v } = rgbToHsb(r, g, b);
          return `HSB ${pad(h)}° ${pad(s)}% ${pad(v)}%`;
        })()
      : (() => {
          const { h, s, l } = rgbToHsl(r, g, b);
          return `HSL ${pad(h)}° ${pad(s)}% ${pad(l)}%`;
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
      <span className="text-muted-foreground">
        RGB {pad(r)} {pad(g)} {pad(b)}
      </span>
      <span className="text-muted-foreground">{model}</span>
    </button>
  );
}

/** Header readout: pinned sample and live hover sample as two stable
 * rows; clicking a row copies its hex. */
export function ColorReadout() {
  const hoverColor = useUiStore((s) => s.hoverColor);
  const pinnedColor = useUiStore((s) => s.pinnedColor);

  return (
    <div className="flex flex-col items-end">
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
