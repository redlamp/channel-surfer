"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImageUp, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BreakdownCanvas } from "@/components/breakdown-canvas";
import { useSourceStore } from "@/stores/source-store";

const TILE_LABELS = [
  ["Source", "Hue · mid sat", "Hue · max sat"],
  ["Hue map", "Saturation", "Brightness"],
  ["Red", "Green", "Blue"],
];

export function SurferApp() {
  const { name, width, height, isDemo, error, hydrate, loadFile, resetToDemo } =
    useSourceStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) void loadFile(file);
    },
    [loadFile],
  );

  return (
    <div
      className="flex h-dvh flex-col bg-background text-foreground"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 md:px-6">
        <div>
          <h1 className="font-mono text-xl font-semibold tracking-tight">
            Channel Surfer
          </h1>
          <p className="text-base text-muted-foreground">
            How RGB and HSB channels build an image
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isDemo && (
            <Button variant="ghost" onClick={() => void resetToDemo()}>
              <Undo2 aria-hidden />
              Demo image
            </Button>
          )}
          <Button onClick={() => fileInputRef.current?.click()}>
            <ImageUp aria-hidden />
            Open image
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1 flex-col gap-3 p-4 md:p-6">
        <div className="min-h-0 flex-1">
          <BreakdownCanvas />
        </div>
        <div className="grid w-full grid-cols-3 gap-x-2 text-center font-mono text-base text-muted-foreground">
          {TILE_LABELS.flat().map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        {dragging && (
          <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-background/80">
            <p className="text-lg font-medium">Drop an image to surf it</p>
          </div>
        )}
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2 md:px-6">
        <p className="text-base text-muted-foreground">
          {error ?? (name ? `${name} — ${width}×${height}` : "Loading…")}
        </p>
        <p className="text-base text-muted-foreground">
          Images stay on your device
        </p>
      </footer>
    </div>
  );
}
