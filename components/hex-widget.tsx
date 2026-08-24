"use client";

import { useEffect } from "react";
import { HexagonMini } from "@/components/color-hexagon";
import { useUiStore } from "@/stores/ui-store";

/** Click-toggle sizes: the header size and double it. */
const SIZE_A = 81;
const SIZE_B = 162;
const MIN_SIZE = 56;
const MAX_SIZE = 360;
/** Dropping the card this close to the top re-docks it (desktop). */
const DOCK_ZONE_PX = 72;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), hi);

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
    s.setHexWidget({
      mode: "floating",
      x: clamp(start.origX + dx, 4, window.innerWidth - s.hexWidget.size - 16),
      y: clamp(start.origY + dy, 4, window.innerHeight - s.hexWidget.size - 16),
    });
  };
  const up = (ev: PointerEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    const s = useUiStore.getState();
    s.setHexDragging(false);
    if (!start.moved) {
      // A plain tap/click toggles the preset sizes — floating only; the
      // docked widget stays at header size.
      if (s.hexWidget.mode === "floating")
        s.setHexWidget({
          size: s.hexWidget.size < (SIZE_A + SIZE_B) / 2 ? SIZE_B : SIZE_A,
        });
    } else if (
      s.hexWidget.mode === "floating" &&
      ev.clientY < DOCK_ZONE_PX &&
      window.innerWidth >= 1280
    ) {
      // Dropping it back onto the header zone re-docks it.
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

  if (w.mode !== "docked") {
    if (!dragging) return null;
    return (
      <div
        className="shrink-0 rounded-lg border-2 border-dashed border-ring bg-muted/40 max-xl:hidden"
        style={{ width: SIZE_A + 8, height: SIZE_A + 8 }}
        aria-hidden
      />
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
      className="fixed z-50 cursor-grab touch-none select-none rounded-lg border border-border bg-popover/90 p-1.5 shadow-[var(--shadow-lg)] transition-colors hover:border-ring/70 hover:bg-popover active:cursor-grabbing"
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
