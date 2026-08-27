"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

/**
 * A "?" that reveals its help text in a card floated to the LEFT of the
 * inspector panel, over the canvas — the panel column stays terse.
 *
 * Portaled to <body>: the panel's backdrop-blur makes the aside the
 * containing block for fixed descendants, so a card rendered in place
 * would still be clipped by the panel's overflow.
 */
export function HelpTip({ children }: { children: React.ReactNode }) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  return (
    <>
      <span
        aria-label="Help"
        className="inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-full border border-input font-mono text-xs leading-none text-muted-foreground hover:bg-muted hover:text-foreground"
        onMouseEnter={(e) => {
          const row = e.currentTarget.getBoundingClientRect();
          const panel = e.currentTarget
            .closest("aside")
            ?.getBoundingClientRect();
          setPos({
            top: Math.max(row.top - 8, 8),
            right: window.innerWidth - (panel?.left ?? row.left) + 8,
          });
        }}
        onMouseLeave={() => setPos(null)}
      >
        ?
      </span>
      {pos &&
        createPortal(
          <div
            style={pos}
            className="pointer-events-none fixed z-50 w-72 rounded-md border border-border bg-popover p-3 text-base text-muted-foreground shadow-[var(--shadow-lg)]"
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
