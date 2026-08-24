"use client";

import { useEffect } from "react";
import { MoveDiagonal2 } from "lucide-react";
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
    start.moved = true;
    const s = useUiStore.getState();
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
    if (!start.moved) {
      // A plain tap/click toggles between the two preset sizes.
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

/** The header slot: renders the widget while docked (md+ only). */
export function HexDock() {
  const w = useUiStore((s) => s.hexWidget);
  if (w.mode !== "docked") return null;
  return (
    <div
      className="shrink-0 cursor-grab touch-none select-none active:cursor-grabbing max-xl:hidden"
      title="Click to toggle size · drag to detach"
      onPointerDown={beginDrag}
    >
      <HexagonMini height={w.size} />
    </div>
  );
}

/** The free-floating card: draggable anywhere, corner-resizable. */
export function HexFloat() {
  const w = useUiStore((s) => s.hexWidget);
  const setHexWidget = useUiStore((s) => s.setHexWidget);

  // Compact-layout screens have no header slot — start out floating.
  useEffect(() => {
    if (window.innerWidth < 1280) {
      setHexWidget({
        mode: "floating",
        size: 64,
        x: window.innerWidth - 64 - 28,
        y: 84,
      });
    }
  }, [setHexWidget]);

  if (w.mode !== "floating") return null;
  return (
    <div
      className="fixed z-50 cursor-grab touch-none select-none rounded-lg border border-border bg-popover/90 p-1.5 shadow-[var(--shadow-lg)] active:cursor-grabbing"
      style={{ left: w.x, top: w.y }}
      title="Click to toggle size · drag to move"
      onPointerDown={beginDrag}
    >
      <HexagonMini height={w.size} />
      <button
        type="button"
        aria-label="Resize hexagon"
        className="absolute -bottom-1 -right-1 cursor-nwse-resize rounded-md bg-popover/90 p-0.5 text-muted-foreground hover:text-foreground"
        onPointerDown={beginResize}
      >
        <MoveDiagonal2 className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
