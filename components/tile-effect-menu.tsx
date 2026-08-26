"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  COMPASS,
  TILE_TRANSFORMS,
  TRANSFORM_KEYS,
  type TransformKey,
} from "@/lib/tile-transforms";

export interface TileMenuState {
  /** Position within the canvas wrapper, in px. */
  x: number;
  y: number;
  /** Grid position being reassigned. */
  tile: number;
  current: TransformKey;
}

/**
 * Right-click effect picker for one tile. Rendered inside the canvas
 * wrapper (which is `relative`), positioned at the click and clamped to
 * stay on screen.
 */
export function TileEffectMenu({
  state,
  onPick,
  onClose,
}: {
  state: TileMenuState;
  onPick: (tile: number, key: TransformKey) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: state.x, y: state.y });

  // Flip/clamp into the wrapper once the real size is known, so a
  // right-click near an edge doesn't open a menu that runs off it.
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;
    const m = 8;
    const maxX = parent.clientWidth - el.offsetWidth - m;
    const maxY = parent.clientHeight - el.offsetHeight - m;
    setPos({
      x: Math.max(m, Math.min(state.x, maxX)),
      y: Math.max(m, Math.min(state.y, maxY)),
    });
  }, [state.x, state.y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    // Capture so the canvas doesn't also act on the dismissing click.
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`Effect for the ${COMPASS[state.tile]} tile`}
      className="absolute z-20 max-h-[70%] w-60 overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-[var(--shadow-md)]"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="px-3 py-1 font-mono text-base text-muted-foreground">
        {COMPASS[state.tile]} tile
      </div>
      {TRANSFORM_KEYS.map((k) => {
        const active = k === state.current;
        return (
          <button
            key={k}
            type="button"
            role="menuitemradio"
            aria-checked={active}
            title={TILE_TRANSFORMS[k].blurb}
            onClick={() => {
              onPick(state.tile, k);
              onClose();
            }}
            className={cn(
              "flex w-full cursor-pointer items-center gap-2 px-3 py-1 text-left text-base transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-surface-inset",
            )}
          >
            <Check
              className={cn("size-4 shrink-0", active ? "" : "opacity-0")}
              aria-hidden
            />
            {TILE_TRANSFORMS[k].name}
          </button>
        );
      })}
    </div>
  );
}
