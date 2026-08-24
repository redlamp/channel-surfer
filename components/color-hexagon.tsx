"use client";

import { useEffect, useRef } from "react";
import { rgbToHex, rgbToHsb } from "@/lib/color";
import { useUiStore, type SampledColor } from "@/stores/ui-store";

/** Header-sized hexagon: the full HexagonInner (labels off) scaled down
 * to a given height, cropped to the wheel plus enough margin for the
 * ring and the hue-line color swatch. */
export function HexagonMini({ height = 56 }: { height?: number }) {
  // Breathing room beyond the ring so it and the hue swatch stay visible.
  const VIS_PAD = 10;
  const s = height / ((R + VIS_PAD) * 2);
  return (
    <div
      className="relative shrink-0 overflow-hidden"
      style={{ width: height, height }}
      aria-hidden
    >
      <div
        style={{
          transform: `scale(${s})`,
          transformOrigin: "top left",
          width: BOX,
          height: BOX,
          marginLeft: -(PAD - VIS_PAD) * s,
          marginTop: -(PAD - VIS_PAD) * s,
        }}
      >
        <HexagonInner labels={false} />
      </div>
    </div>
  );
}

/** Circumradius of the hexagon in CSS px (corners sit on this circle). */
const R = 72;
/** Room around the hexagon for the corner labels. */
const PAD = 20;
const BOX = (R + PAD) * 2;

const DEG = Math.PI / 180;

/** Max radius of the flat-top hexagon at angle theta (corners at 0, 60,
 * 120... degrees — R right, Y/G along the top, C left, B/M bottom). */
function hexRadius(thetaDeg: number) {
  const local = ((thetaDeg % 60) + 60) % 60;
  return (R * Math.cos(30 * DEG)) / Math.cos((local - 30) * DEG);
}

function hsvToRgb255(h01: number, s: number): [number, number, number] {
  const h = (((h01 % 1) + 1) % 1) * 6;
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

/** The three channel vectors at full strength — stems and handle rings
 * share these, matching color-taylor's CHANNEL_COLOR. */
const CHANNEL_COLOR = { r: "#ff0000", g: "#00ff00", b: "#0000ff" } as const;

/** Channel directions: R toward 0°, G toward 120°, B toward 240° (screen
 * y down). Chaining (r,g,b)/255 along these lands on the color's spot in
 * the hexagon — white sums to the center, primaries to their corners. */
const CH_DIR = {
  r: [Math.cos(0), -Math.sin(0)],
  g: [Math.cos(120 * DEG), -Math.sin(120 * DEG)],
  b: [Math.cos(240 * DEG), -Math.sin(240 * DEG)],
} as const;

const CENTER = R + PAD;

/** The chained stem points [origin, +R, +G, +B] for a sample. */
function stemPoints(sample: SampledColor) {
  const pts: { x: number; y: number }[] = [{ x: CENTER, y: CENTER }];
  let x = CENTER;
  let y = CENTER;
  for (const ch of ["r", "g", "b"] as const) {
    const f = (sample[ch] / 255) * R;
    x += CH_DIR[ch][0] * f;
    y += CH_DIR[ch][1] * f;
    pts.push({ x, y });
  }
  return pts;
}

/** The wheel's field color under a point — hue from angle, saturation
 * from hexagonal radius — used to fill the stem tip dots the way
 * color-taylor fills its handles. */
function fieldColorAt(pt: { x: number; y: number }) {
  const dx = pt.x - CENTER;
  const dy = pt.y - CENTER;
  const r = Math.hypot(dx, dy);
  if (r < 0.5) return "rgb(255,255,255)";
  const deg = (Math.atan2(-dy, dx) / DEG + 360) % 360;
  const [cr, cg, cb] = hsvToRgb255(deg / 360, Math.min(r / hexRadius(deg), 1));
  return `rgb(${cr},${cg},${cb})`;
}

/** One stem chain: channel-colored segments plus field-filled tip dots.
 * The pinned variant renders dashed (full alpha) for comparison.
 *
 * Zero-value channels: the SEGMENT is skipped (a zero-length round-cap
 * line still paints a blob), but the DOT always renders — it just sits
 * on the previous joint. Keeping the dots unconditional stops them
 * popping in and out of the tree as a channel crosses zero, which read
 * as a sort/visibility glitch.
 */
function StemChain({
  sample,
  ghost,
}: {
  sample: SampledColor;
  ghost?: boolean;
}) {
  const pts = stemPoints(sample);
  return (
    <g
      style={
        ghost
          ? undefined
          : { filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,0.5))" }
      }
    >
      {(["r", "g", "b"] as const).map(
        (ch, i) =>
          sample[ch] > 0 && (
            <line
              key={ch}
              x1={pts[i].x}
              y1={pts[i].y}
              x2={pts[i + 1].x}
              y2={pts[i + 1].y}
              stroke={CHANNEL_COLOR[ch]}
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray={ghost ? "4 4" : undefined}
            />
          ),
      )}
      {(["r", "g", "b"] as const).map((ch, i) => (
        <circle
          key={`${ch}-dot`}
          cx={pts[i + 1].x}
          cy={pts[i + 1].y}
          r={ghost ? 3.5 : 4.5}
          fill={fieldColorAt(pts[i + 1])}
          stroke={CHANNEL_COLOR[ch]}
          strokeWidth={3}
        />
      ))}
      <circle cx={CENTER} cy={CENTER} r={2.5} fill="#ff0000" />
    </g>
  );
}

/** The hexagon wheel with color-taylor's channel-vector stems: red, green,
 * and blue segments chain from the center dot to the sample's position,
 * each tipped with a channel-ringed dot. Rendered inside the hover card
 * that BreakdownCanvas positions each frame. */
export function HexagonInner({ labels = true }: { labels?: boolean }) {
  const hoverColor = useUiStore((s) => s.hoverColor);
  const pinnedColor = useUiStore((s) => s.pinnedColor);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // The wheel itself is static — rasterize once at 2x.
  useEffect(() => {
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
  }, []);

  const pinPos = pinnedColor ? stemPoints(pinnedColor)[3] : null;

  return (
    <div className="relative" style={{ width: BOX, height: BOX }}>
      <div
        className="absolute rounded-full border border-border"
        style={{ left: PAD, top: PAD, width: R * 2, height: R * 2 }}
      />
      <canvas
        ref={canvasRef}
        className="absolute"
        style={{ left: PAD, top: PAD, width: R * 2, height: R * 2 }}
      />
      {labels &&
        CORNER_LABELS.map((l) => (
          <span
            key={l.text}
            className="absolute -translate-x-1/2 -translate-y-1/2 font-mono text-base font-bold"
            style={{
              color: l.color,
              left: CENTER + (R + 11) * Math.cos(l.deg * DEG),
              top: CENTER - (R + 11) * Math.sin(l.deg * DEG),
            }}
          >
            {l.text}
          </span>
        ))}
      <svg
        className="absolute inset-0"
        width={BOX}
        height={BOX}
        viewBox={`0 0 ${BOX} ${BOX}`}
      >
        {/* Hue line: dotted ray from the center through the active
            color's hue to the ring, ending in a swatch of the final
            color (no degree text). Hidden for greys, whose hue is
            undefined. */}
        {(() => {
          const active = hoverColor ?? pinnedColor;
          if (!active) return null;
          const { h, s } = rgbToHsb(active.r, active.g, active.b);
          if (s === 0) return null;
          const ex = CENTER + R * Math.cos(h * DEG);
          const ey = CENTER - R * Math.sin(h * DEG);
          return (
            <g>
              <line
                x1={CENTER}
                y1={CENTER}
                x2={ex}
                y2={ey}
                stroke="rgba(255,255,255,0.5)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
              />
              <circle
                cx={ex}
                cy={ey}
                r={7}
                fill={rgbToHex(active.r, active.g, active.b)}
                stroke="rgba(255,255,255,0.9)"
                strokeWidth={1.5}
                style={{ filter: "drop-shadow(0 0 1.5px rgba(0,0,0,0.8))" }}
              />
            </g>
          );
        })()}

        {/* Pinned construction chain: dashed, under the live stems so the
            two read as reference vs current. */}
        {pinnedColor && <StemChain sample={pinnedColor} ghost />}
        {pinPos && (
          <circle
            cx={pinPos.x}
            cy={pinPos.y}
            r={6}
            fill="none"
            stroke="white"
            strokeWidth={2}
            style={{ filter: "drop-shadow(0 0 1px rgba(0,0,0,0.9))" }}
          />
        )}
        {hoverColor && <StemChain sample={hoverColor} />}
      </svg>
    </div>
  );
}

