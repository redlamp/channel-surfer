"use client";

import { cn } from "@/lib/utils";

/**
 * Segmented single-choice control. `size="sm"` is the on-canvas toolbar
 * variant; the default fills its container for settings rows.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "default",
  className,
}: {
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (value: T) => void;
  size?: "default" | "sm";
  className?: string;
}) {
  const sm = size === "sm";
  return (
    <div
      className={cn(
        "flex rounded-lg border border-border bg-surface-inset p-0.5",
        sm ? "shrink-0" : "flex-wrap",
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "cursor-pointer rounded-md text-base whitespace-nowrap transition-colors",
            sm ? "px-2 py-0.5" : "flex-1 px-2.5 py-1",
            value === o.value
              ? "bg-primary text-primary-foreground shadow-[var(--shadow-sm)]"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
