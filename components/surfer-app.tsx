"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, ImageUp, LibraryBig, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BreakdownCanvas } from "@/components/breakdown-canvas";
import { ColorReadout } from "@/components/color-readout";
import { ColorSteps } from "@/components/color-steps";
import { LibraryPanel } from "@/components/library-panel";
import { SettingsPanel } from "@/components/settings-panel";
import { useSourceStore } from "@/stores/source-store";
import { useUiStore } from "@/stores/ui-store";

export function SurferApp() {
  const name = useSourceStore((s) => s.name);
  const width = useSourceStore((s) => s.width);
  const height = useSourceStore((s) => s.height);
  const error = useSourceStore((s) => s.error);
  const hydrate = useSourceStore((s) => s.hydrate);
  const loadFiles = useSourceStore((s) => s.loadFiles);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      void loadFiles(Array.from(files));
    },
    [loadFiles],
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
        <div className="shrink-0">
          <h1 className="font-mono text-xl font-semibold tracking-tight">
            Channel Surfer <span aria-hidden>🏄🌈</span>
          </h1>
          <p className="text-base text-muted-foreground">
            How RGB and HSB channels build an image
          </p>
        </div>
        <div className="min-w-0 flex-1">
          <ColorReadout />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button onClick={() => fileInputRef.current?.click()}>
            <ImageUp aria-hidden />
            Open images
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Export breakdown as PNG"
            title="Export breakdown as PNG"
            onClick={() => {
              const canvas = useUiStore.getState().canvasEl;
              if (!canvas) return;
              canvas.toBlob((blob) => {
                if (!blob) return;
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                const base = name.replace(/\.[a-z0-9]+$/i, "") || "breakdown";
                a.download = `channel-surfer-${base}.png`;
                a.click();
                URL.revokeObjectURL(a.href);
              });
            }}
          >
            <Download aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle library"
            aria-pressed={libraryOpen}
            onClick={() => setLibraryOpen((v) => !v)}
          >
            <LibraryBig aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 aria-hidden />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1 gap-4 p-4 md:p-6">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <div className="min-h-0 flex-1">
            <BreakdownCanvas />
          </div>
          <ColorSteps />
        </div>
        {libraryOpen && <LibraryPanel />}
        {dragging && (
          <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-background/80">
            <p className="text-lg font-medium">Drop images to surf them</p>
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
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
