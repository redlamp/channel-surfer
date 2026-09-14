"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSourceStore } from "@/stores/source-store";
import { canvasBridge } from "@/stores/ui-store";

export function ExportButton() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(3072);
  const [names, setNames] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const name = useSourceStore((s) => s.name);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        rootRef.current?.querySelector("button")?.focus();
      }
    };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);
  const save = async () => {
    if (!canvasBridge.exportGrid) return;
    setBusy(true); setError("");
    try {
      const blob = await canvasBridge.exportGrid(size, names);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `channel-surfer-${name.replace(/\.[a-z0-9]+$/i, "") || "breakdown"}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setOpen(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Export failed.");
    } finally { setBusy(false); }
  };
  return (
    <div ref={rootRef} className="relative">
      <Button variant="ghost" size="icon" title="Export breakdown as PNG" aria-label="Export breakdown as PNG" aria-expanded={open} onClick={() => setOpen(!open)}><Download aria-hidden /></Button>
      {open && <div role="group" aria-label="Export options" className="absolute right-0 top-10 z-40 flex w-64 flex-col gap-3 rounded-md border border-border bg-popover p-3 shadow-lg">
        <label className="flex items-center justify-between gap-2">Longest edge
          <select aria-label="Export size" value={size} onChange={(e) => setSize(Number(e.target.value))} className="rounded border border-input bg-background p-1 font-mono">
            {[1536, 3072, 6144].map((size) => <option key={size} value={size}>{size}px</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={names} onChange={(e) => setNames(e.target.checked)} /> Include tile names</label>
        <Button disabled={busy} onClick={() => void save()}>{busy ? "Rendering…" : "Save PNG"}</Button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>}
    </div>
  );
}
