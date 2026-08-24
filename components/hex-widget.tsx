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

/** The dock exists at Tailwind's xl breakpoint. Matching it in rem (not
 * a hard 1280px) keeps the JS checks agreeing with the CSS even when the
 * browser's base font size isn't 16px. */
const DESKTOP_MQ = "(min-width: 80rem)";
const isDesktop = () => window.matchMedia(DESKTOP_MQ).matches;

/** Clamp a floating position for a given size. */
function clampPos(x: number, y: number, size: number) {
  return {
    x: clamp(x, 4, window.innerWidth - size - 16),
    y: clamp(y, 4, window.innerHeight - size - 16),
  };
}

/** The live return-slot element, for real drop-target hit testing. */
let slotEl: HTMLElement | null = null;

/** Is the pointer over the return slot (with a forgiving margin)? Falls
 * back to the old top-strip heuristic if the slot isn't mounted yet. */
function pointerOverSlot(ev: PointerEvent) {
  if (!isDesktop()) return false;
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
  const pid = e.pointerId;
  const rect = e.currentTarget.getBoundingClientRect();
  const start = {
    x: e.clientX,
    y: e.clientY,
    origX: rect.left,
    origY: rect.top,
    moved: false,
  };
  const teardown = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    const s = useUiStore.getState();
    s.setHexDragging(false);
    s.setHexOverDock(false);
  };
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== pid) return;
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
      ...clampPos(start.origX + dx, start.origY + dy, s.hexWidget.size),
    });
  };
  const up = (ev: PointerEvent) => {
    if (ev.pointerId !== pid) return;
    const wasOverDock = useUiStore.getState().hexOverDock;
    teardown();
    const s = useUiStore.getState();
    if (!start.moved) {
      // A plain tap/click toggles the preset sizes — floating only; the
      // docked widget stays at header size. Re-clamp for the new size so
      // growing near an edge can't push the card (or its grip) offscreen.
      if (s.hexWidget.mode === "floating") {
        const size =
          s.hexWidget.size < (SIZE_A + SIZE_B) / 2 ? SIZE_B : SIZE_A;
        s.setHexWidget({
          size,
          ...clampPos(s.hexWidget.x, s.hexWidget.y, size),
        });
      }
    } else if (s.hexWidget.mode === "floating" && wasOverDock) {
      // Releasing over the slot re-docks it.
      s.setHexWidget({ mode: "docked" });
    }
  };
  const cancel = (ev: PointerEvent) => {
    if (ev.pointerId !== pid) return;
    teardown();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
  e.preventDefault();
}

function beginResize(e: React.PointerEvent<HTMLElement>) {
  e.stopPropagation();
  e.preventDefault();
  const pid = e.pointerId;
  const s0 = useUiStore.getState().hexWidget;
  const start = { x: e.clientX, y: e.clientY, size: s0.size };
  const teardown = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", teardownEv);
  };
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== pid) return;
    const delta = Math.max(ev.clientX - start.x, ev.clientY - start.y);
    const s = useUiStore.getState();
    const size = clamp(start.size + delta, MIN_SIZE, MAX_SIZE);
    s.setHexWidget({
      size,
      ...clampPos(s.hexWidget.x, s.hexWidget.y, size),
    });
  };
  const up = (ev: PointerEvent) => {
    if (ev.pointerId !== pid) return;
    teardown();
  };
  const teardownEv = (ev: PointerEvent) => {
    if (ev.pointerId !== pid) return;
    teardown();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", teardownEv);
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
    const mq = window.matchMedia(DESKTOP_MQ);
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
    // Keep a floating card inside the viewport when the window shrinks —
    // clamping otherwise only happens during drags and resizes.
    const onResize = () => {
      const s = useUiStore.getState();
      if (s.hexWidget.mode !== "floating") return;
      const x = clamp(s.hexWidget.x, 4, window.innerWidth - s.hexWidget.size - 16);
      const y = clamp(s.hexWidget.y, 4, window.innerHeight - s.hexWidget.size - 16);
      if (x !== s.hexWidget.x || y !== s.hexWidget.y)
        s.setHexWidget({ x, y });
    };
    window.addEventListener("resize", onResize);
    return () => {
      mq.removeEventListener("change", apply);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  if (w.mode !== "floating") return null;
  return (
    <div
      className={cn(
        "fixed z-50 cursor-grab touch-none select-none rounded-lg border border-border bg-popover/20 p-1.5 shadow-[var(--shadow-lg)] transition-[color,background-color,border-color,opacity] active:cursor-grabbing",
        dragging
          ? "opacity-60"
          : "hover:border-ring/70 hover:bg-popover/50",
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
