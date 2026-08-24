"use client";

import { useEffect } from "react";
import { HexagonMini } from "@/components/color-hexagon";
import { useUiStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

/** Click-toggle sizes: the header size and double it. */
const SIZE_A = 81;
const SIZE_B = 162;
const MIN_SIZE = 56;
const MAX_SIZE = 360;
/** Dropping the card this close to the top re-docks it (desktop). */
const DOCK_ZONE_PX = 72;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), hi);

/** The live return-slot element, for real drop-target hit testing. */
let slotEl: HTMLElement | null = null;

/** Is the pointer over the return slot (with a forgiving margin)? Falls
 * back to the old top-strip heuristic if the slot isn't mounted yet. */
function pointerOverSlot(ev: PointerEvent) {
  if (window.innerWidth < 1280) return false;
  if (slotEl) {
    const r = slotEl.getBoundingClientRect();
    const m = 12;
    return (
      ev.clientX >= r.left - m &&
      ev.clientX <= r.right + m &&
      ev.clientY >= r.top - m &&
      ev.clientY <= r.bottom + m
    );
  }
  return ev.clientY < DOCK_ZONE_PX;
}

/**
 * Drag via window listeners (not element capture): a drag that starts on
 * the docked widget continues seamlessly after the dock unmounts and the
 * floating card takes over mid-gesture.
 */
function beginDrag(e: React.PointerEvent<HTMLElement>) {
  if (e.button !== 0) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const start = {
    x: e.clientX,
    y: e.clientY,
    origX: rect.left,
    origY: rect.top,
    moved: false,
  };
  const move = (ev: PointerEvent) => {
    const dx = ev.clientX - start.x;
    const dy = ev.clientY - start.y;
    if (!start.moved && Math.hypot(dx, dy) < 6) return;
    const s = useUiStore.getState();
    if (!start.moved) {
      start.moved = true;
      s.setHexDragging(true);
    }
    const overDock = pointerOverSlot(ev);
    if (overDock !== s.hexOverDock) s.setHexOverDock(overDock);
    s.setHexWidget({
      mode: "floating",
      x: clamp(start.origX + dx, 4, window.innerWidth - s.hexWidget.size - 16),
      y: clamp(start.origY + dy, 4, window.innerHeight - s.hexWidget.size - 16),
    });
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    const s = useUiStore.getState();
    const wasOverDock = s.hexOverDock;
    s.setHexDragging(false);
    s.setHexOverDock(false);
    if (!start.moved) {
      // A plain tap/click toggles the preset sizes — floating only; the
      // docked widget stays at header size.
      if (s.hexWidget.mode === "floating")
        s.setHexWidget({
          size: s.hexWidget.size < (SIZE_A + SIZE_B) / 2 ? SIZE_B : SIZE_A,
        });
    } else if (s.hexWidget.mode === "floating" && wasOverDock) {
      // Releasing over the slot re-docks it.
      s.setHexWidget({ mode: "docked" });
    }
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  e.preventDefault();
}

function beginResize(e: React.PointerEvent<HTMLElement>) {
  e.stopPropagation();
  e.preventDefault();
  const s0 = useUiStore.getState().hexWidget;
  const start = { x: e.clientX, y: e.clientY, size: s0.size };
  const move = (ev: PointerEvent) => {
    const delta = Math.max(ev.clientX - start.x, ev.clientY - start.y);
    const s = useUiStore.getState();
    s.setHexWidget({
      size: clamp(start.size + delta, MIN_SIZE, MAX_SIZE),
    });
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

/** iPadOS-style flipped-L corner mark implying resize. */
function ResizeGrip({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <path d="M4 14h5.5a4.5 4.5 0 0 0 4.5-4.5V4" />
    </svg>
  );
}

/** The header slot: renders the widget while docked (xl+ only), always
 * at the small header size — sizing is a floating-mode privilege. While
 * the widget is floating and mid-drag, the empty slot lights up as a
 * drop target for re-docking. */
export function HexDock() {
  const w = useUiStore((s) => s.hexWidget);
  const dragging = useUiStore((s) => s.hexDragging);
  const overDock = useUiStore((s) => s.hexOverDock);

  if (w.mode !== "docked") {
    // While detached, the slot stays as a square return target: click it
    // (or drop the widget on the header) to re-dock. It is fixed to the
    // exact footprint the docked widget occupies (hex + padding), so
    // docking and detaching never shift the header — and at that width
    // the caption wraps to three short lines.
    return (
      <button
        type="button"
        ref={(el) => {
          slotEl = el;
        }}
        aria-label="Return color hex to the header"
        onClick={() => useUiStore.getState().setHexWidget({ mode: "docked" })}
        style={{ width: SIZE_A + 8, height: SIZE_A + 8 }}
        className={cn(
          "flex shrink-0 cursor-pointer select-none items-center justify-center whitespace-normal rounded-lg border-2 border-dashed p-1 text-center font-mono text-base leading-tight transition-colors max-xl:hidden",
          dragging && overDock
            ? "scale-105 border-solid border-ring bg-ring/25 text-foreground"
            : dragging
              ? "border-ring bg-muted/40 text-foreground"
              : "border-border text-muted-foreground hover:border-ring hover:bg-muted/40 hover:text-foreground",
        )}
      >
        <span
          className={cn(
            "transition-opacity",
            dragging ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        >
          return color hex
        </span>
      </button>
    );
  }
  return (
    <div
      className="shrink-0 cursor-grab touch-none select-none rounded-lg p-1 transition-colors group-hover:bg-muted/70 active:cursor-grabbing max-xl:hidden"
      title="Drag to detach"
      onPointerDown={beginDrag}
    >
      <HexagonMini height={SIZE_A} />
    </div>
  );
}

/** The free-floating card: draggable anywhere, corner-resizable. */
export function HexFloat() {
  const w = useUiStore((s) => s.hexWidget);
  const dragging = useUiStore((s) => s.hexDragging);

  // Compact-layout screens have no header slot, so the widget must live
  // as a float there — tracked live via matchMedia, not just at mount,
  // so window resizes and devtools device mode keep the hexagon visible.
  // A float we forced is undone when the header slot returns; one the
  // user dragged out stays where they put it.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    let autoFloated = false;
    const apply = () => {
      const s = useUiStore.getState();
      if (!mq.matches) {
        if (s.hexWidget.mode === "docked") {
          autoFloated = true;
          const size = Math.min(s.hexWidget.size, 96);
          s.setHexWidget({
            mode: "floating",
            size,
            x: Math.max(window.innerWidth - size - 28, 4),
            y: 100,
          });
        }
      } else if (autoFloated && s.hexWidget.mode === "floating") {
        autoFloated = false;
        s.setHexWidget({ mode: "docked" });
      }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  if (w.mode !== "floating") return null;
  return (
    <div
      className={cn(
        "fixed z-50 cursor-grab touch-none select-none rounded-lg border border-border p-1.5 shadow-[var(--shadow-lg)] transition-[color,background-color,border-color,opacity] active:cursor-grabbing",
        dragging
          ? "bg-popover/20 opacity-60"
          : "bg-popover/90 hover:border-ring/70 hover:bg-popover",
      )}
      style={{ left: w.x, top: w.y }}
      title="Click to toggle size · drag to move"
      onPointerDown={beginDrag}
    >
      <HexagonMini height={w.size} />
      <button
        type="button"
        aria-label="Resize hexagon"
        className="absolute -bottom-2 -right-2 cursor-nwse-resize p-1 text-muted-foreground hover:text-foreground"
        onPointerDown={beginResize}
      >
        <ResizeGrip className="size-4" />
      </button>
    </div>
  );
}
