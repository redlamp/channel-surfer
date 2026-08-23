"use client";

import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  useSettingsStore,
  type HighlightMode,
} from "@/stores/settings-store";
import { cn } from "@/lib/utils";

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex rounded-lg border border-border bg-surface-inset p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 cursor-pointer rounded-md px-3 py-1 text-base transition-colors",
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

const HIGHLIGHT_OPTIONS: { value: HighlightMode; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "tile", label: "Hue tile" },
  { value: "all", label: "All tiles" },
];

/**
 * Settings as a right-edge sheet (the color-taylor pattern): base-ui
 * Dialog supplies portal, backdrop, focus trap, Escape and click-outside.
 * The scrim is deliberately faint — the settings are judged by watching
 * the canvas while you toggle them.
 */
export function SettingsPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const highlightMode = useSettingsStore((s) => s.highlightMode);
  const setHighlightMode = useSettingsStore((s) => s.setHighlightMode);
  const rgbColorize = useSettingsStore((s) => s.rgbColorize);
  const setRgbColorize = useSettingsStore((s) => s.setRgbColorize);

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 isolate z-50 bg-black/20 duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup
          className={
            "fixed top-0 right-0 bottom-0 z-50 flex w-[min(88vw,380px)] flex-col " +
            "border-l border-border bg-background shadow-[var(--shadow-lg)] outline-none duration-200 " +
            "data-open:animate-in data-open:slide-in-from-right " +
            "data-closed:animate-out data-closed:slide-out-to-right"
          }
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <DialogPrimitive.Title className="text-base font-semibold">
              Settings
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Close settings"
              className="cursor-pointer select-none rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4">
            <div className="space-y-2">
              <Label>Hue highlight on hover</Label>
              <Segmented
                value={highlightMode}
                options={HIGHLIGHT_OPTIONS}
                onChange={setHighlightMode}
              />
              <p className="text-base text-muted-foreground">
                Recalibrates the hue map so the hovered pixel&apos;s hue reads
                as white.
              </p>
            </div>

            <div className="space-y-2">
              <Label>RGB channel tiles</Label>
              <Segmented
                value={rgbColorize ? "color" : "gray"}
                options={[
                  { value: "gray", label: "Black to white" },
                  { value: "color", label: "Black to color" },
                ]}
                onChange={(v) => setRgbColorize(v === "color")}
              />
              <p className="text-base text-muted-foreground">
                Single-clicking an RGB tile also toggles this.
              </p>
            </div>
          </div>

          <div className="border-t border-border px-4 py-2.5">
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                setHighlightMode("all");
                setRgbColorize(false);
              }}
            >
              Reset to defaults
            </Button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
