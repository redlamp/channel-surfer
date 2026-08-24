"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, LibraryBig, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BreakdownCanvas } from "@/components/breakdown-canvas";
import { HexagonMini } from "@/components/color-hexagon";
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
  const [dragging, setDragging] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      // Open the library so freshly added images visibly land somewhere.
      void loadFiles(Array.from(files)).then(() => setLibraryOpen(true));
    },
    [loadFiles],
  );

  // PgUp/PgDn step through the media library (display order: newest
  // first, demo last).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "PageUp" && e.key !== "PageDown") return;
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))
      )
        return;
      e.preventDefault();
      const s = useSourceStore.getState();
      const order = [...s.items.map((i) => i.id)].reverse();
      order.push(...s.demoItems.map((d) => d.id));
      const idx = Math.max(order.indexOf(s.currentId), 0);
      const next =
        e.key === "PageDown"
          ? Math.min(idx + 1, order.length - 1)
          : Math.max(idx - 1, 0);
      if (next === idx) return;
      s.select(order[next]);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
      {/* Crowding collapse order: subtitle hides first (<lg), then the
          title takes its own row (<md) and the cluster reflows to
          pickers / buttons / hexagon (<sm splits pickers, <480 splits
          buttons, leaving the hexagon last). */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 md:px-6">
        <div className="min-w-0 shrink-0 max-md:basis-full">
          <h1 className="font-mono text-xl font-semibold tracking-tight">
            Channel Surfer <span aria-hidden>🏄🌈</span>
          </h1>
          <p className="text-base text-muted-foreground max-lg:hidden">
            How RGB and HSB channels build an image
          </p>
        </div>
        <div className="ml-auto shrink-0 max-md:order-3 max-md:ml-0">
          <HexagonMini height={81} />
        </div>
        <div className="min-w-0 max-md:order-1 max-sm:basis-full">
          <ColorReadout />
        </div>
        <div className="flex shrink-0 items-center gap-2 max-md:order-2 max-[480px]:basis-full">
          <Button
            variant="ghost"
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
            Export
          </Button>
          <Button
            variant="ghost"
            aria-pressed={libraryOpen}
            onClick={() => setLibraryOpen((v) => !v)}
          >
            <LibraryBig aria-hidden />
            Media Library
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Settings"
            aria-pressed={settingsOpen}
            onClick={() => setSettingsOpen((v) => !v)}
          >
            <Settings2 aria-hidden />
          </Button>
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
        {settingsOpen && (
          <SettingsPanel onClose={() => setSettingsOpen(false)} />
        )}
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
    </div>
  );
}
