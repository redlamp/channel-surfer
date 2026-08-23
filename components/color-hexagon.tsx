"use client";

import { useEffect, useRef } from "react";
import { rgbToHsb } from "@/lib/color";
import { useSettingsStore } from "@/stores/settings-store";
import { useUiStore, type SampledColor } from "@/stores/ui-store";

/** Circumradius of the hexagon in CSS px (corners sit on this circle). */
const R = 96;
/** Room around the hexagon for the corner labels. */
const PAD = 24;
const BOX = (R + PAD) * 2;

const DEG = Math.PI / 180;

/** Max radius of the flat-top hexagon at angle theta (corners at 0, 60,
 * 120... degrees — R right, Y/G along the top, C left, B/M bottom). */
function hexRadius(thetaDeg: number) {
  const local = ((thetaDeg % 60) + 60) % 60;
  return (R * Math.cos(30 * DEG)) / Math.cos((local - 30) * DEG);
}

function hsvToRgb255(h01: number, s: number): [number, number, number] {
  const h = ((h01 % 1) + 1) % 1 * 6;
  const i = Math.floor(h);
  const f = h - i;
  const p = 1 - s;
  const q = 1 - s * f;
  const t = 1 - s * (1 - f);
  const [r, g, b] =
    i === 0
      ? [1, t, p]
      : i === 1
        ? [q, 1, p]
        : i === 2
          ? [p, 1, t]
          : i === 3
            ? [p, q, 1]
            : i === 4
              ? [t, p, 1]
              : [1, p, q];
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

const CORNER_LABELS: { deg: number; text: string; color: string }[] = [
  { deg: 0, text: "R", color: "#ff5555" },
  { deg: 60, text: "Y", color: "#eedd33" },
  { deg: 120, text: "G", color: "#44ee44" },
  { deg: 180, text: "C", color: "#44eeee" },
  { deg: 240, text: "B", color: "#7777ff" },
  { deg: 300, text: "M", color: "#ee55ee" },
];

/** Marker position (CSS px within the box) for a sampled color. */
function markerPos(sample: SampledColor) {
  const { h, s } = rgbToHsb(sample.r, sample.g, sample.b);
  const r = (s / 100) * hexRadius(h);
  return {
    left: R + PAD + r * Math.cos(h * DEG),
    top: R + PAD - r * Math.sin(h * DEG),
  };
}

/**
 * The color-taylor Hexagon, non-interactive: the HSB hue/saturation plane
 * as a flat-top hexagon (primaries at the corners, white at center), with
 * markers for the hovered and pinned samples. Brightness is not shown.
 */
export function ColorHexagon() {
  const show = useSettingsStore((s) => s.showColorHexagon);
  const hoverColor = useUiStore((s) => s.hoverColor);
  const pinnedColor = useUiStore((s) => s.pinnedColor);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // The wheel itself is static — rasterize once at 2x.
  useEffect(() => {
    if (!show) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scale = 2;
    const px = R * 2 * scale;
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(px, px);
    for (let y = 0; y < px; y++) {
      for (let x = 0; x < px; x++) {
        const dx = x / scale - R;
        const dy = y / scale - R;
        const theta = Math.atan2(-dy, dx) / DEG;
        const deg = (theta + 360) % 360;
        const rm = hexRadius(deg);
        const r = Math.hypot(dx, dy);
        const alpha = Math.max(0, Math.min(1, (rm - r) / 1.2));
        if (alpha === 0) continue;
        const [cr, cg, cb] = hsvToRgb255(deg / 360, Math.min(r / rm, 1));
        const i = (y * px + x) * 4;
        img.data[i] = cr;
        img.data[i + 1] = cg;
        img.data[i + 2] = cb;
        img.data[i + 3] = Math.round(alpha * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [show]);

  if (!show) return null;

  return (
    <div className="shrink-0 rounded-lg border border-border bg-card p-2 shadow-[var(--shadow-sm)]">
      <p className="px-1 pb-1 font-sans text-base font-semibold text-foreground">
        Hexagon
      </p>
      <div className="relative" style={{ width: BOX, height: BOX }}>
        {/* Circumscribed circle through the corners. */}
        <div
          className="absolute rounded-full border border-border"
          style={{ left: PAD, top: PAD, width: R * 2, height: R * 2 }}
        />
        <canvas
          ref={canvasRef}
          className="absolute"
          style={{ left: PAD, top: PAD, width: R * 2, height: R * 2 }}
        />
        {CORNER_LABELS.map((l) => (
          <span
            key={l.text}
            className="absolute -translate-x-1/2 -translate-y-1/2 font-mono text-base font-bold"
            style={{
              color: l.color,
              left: R + PAD + (R + 12) * Math.cos(l.deg * DEG),
              top: R + PAD - (R + 12) * Math.sin(l.deg * DEG),
            }}
          >
            {l.text}
          </span>
        ))}
        {pinnedColor && (
          <span
            className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1.5px_rgba(0,0,0,0.85)]"
            style={markerPos(pinnedColor)}
            title="Pinned color"
          />
        )}
        {hoverColor && (
          <span
            className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-white/40 shadow-[0_0_0_1px_rgba(0,0,0,0.85)]"
            style={markerPos(hoverColor)}
            title="Hovered color"
          />
        )}
      </div>
    </div>
  );
}
