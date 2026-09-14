"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BreakdownCanvas } from "@/components/breakdown-canvas";
import { ColorSteps } from "@/components/color-steps";
import { ExportButton } from "@/components/export-button";
import { DisplayToolbar } from "@/components/display-toolbar";
import { LibraryPanel, LIBRARY_WIDTH } from "@/components/library-panel";
import { HexFloat } from "@/components/hex-widget";
import { InspectorPanel, type PanelTab } from "@/components/inspector-panel";
import { NARROW_QUERY, useMediaQuery } from "@/lib/use-media-query";
import { useSettingsStore } from "@/stores/settings-store";
import { useSourceStore } from "@/stores/source-store";
import { useUiStore } from "@/stores/ui-store";

/** Bottom-sheet height on narrow windows, as a fraction of the window;
 * the sheet's CSS height (`h-[55dvh]`) must agree. */
export const SHEET_FRACTION = 0.55;

/**
 * The full-bleed shell from the layout redesign: the display area IS
 * the window; a thin translucent header floats over its top edge, and
 * the inspector panel (Inspect / Settings tabs) overlays the
 * right side instead of taking layout space. The old subtitle lives in
 * the "?" hover card; the old footer's facts moved into the Inspect
 * tab.
 */
export function SurferApp() {
  const error = useSourceStore((s) => s.error);
  const hydrate = useSourceStore((s) => s.hydrate);
  const loadFiles = useSourceStore((s) => s.loadFiles);
  const [dragging, setDragging] = useState(false);
  // Narrow (phone) windows: the panel is a bottom sheet and starts
  // closed, since open it would cover the whole grid.
  const narrow = useMediaQuery(NARROW_QUERY);
  const [panelOpen, setPanelOpen] = useState(() => !narrow);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const inspectorVisible = panelOpen && !(narrow && libraryOpen);
  const [panelTab, setPanelTab] = useState<PanelTab>("inspect");
  const panelWidth = useSettingsStore((s) => s.panelWidth);
  const headerRef = useRef<HTMLElement>(null);
  // Measured, not assumed: the Model group wraps to a second line on
  // narrow windows, making the header taller than its one-row 48px.
  const [headerH, setHeaderH] = useState(48);
  const [windowH, setWindowH] = useState(() =>
    typeof window === "undefined" ? 800 : window.innerHeight,
  );

  useEffect(() => {
    const onResize = () => setWindowH(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeaderH(el.offsetHeight));
    ro.observe(el);
    setHeaderH(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  // Programmatic fits/frames center content in the region the chrome
  // leaves clear: below the header, between the open side panels (or
  // above an open sheet). Manual panning can still move under the panels.
  useEffect(() => {
    useUiStore.getState().setViewInsets({
      top: headerH,
      left: libraryOpen && !narrow ? LIBRARY_WIDTH + 12 : 0,
      right: inspectorVisible && !narrow ? panelWidth + 12 : 0,
      bottom: (inspectorVisible || libraryOpen) && narrow ? Math.round(windowH * SHEET_FRACTION) + 12 : 0,
    });
  }, [inspectorVisible, libraryOpen, panelWidth, headerH, narrow, windowH]);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      // Open the library so freshly added images visibly land somewhere.
      void loadFiles(Array.from(files)).then(() => {
        setLibraryOpen(true);
      });
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
      className="relative h-dvh overflow-hidden bg-background text-foreground"
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
      {/* The display area fills the window; overlays float above it. */}
      <div className="absolute inset-0">
        <BreakdownCanvas />
      </div>

      <header
        ref={headerRef}
        className="absolute inset-x-0 top-0 z-40 flex min-h-12 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-background/70 px-4 py-1.5 backdrop-blur-md"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">

          <h1 className="flex items-center gap-2 font-mono text-xl leading-none font-semibold tracking-tight">
            {/* Mark and wordmark share one height. next/image is off
                under static export, hence a plain img. icon-40 is the
                pre-rounded 2x asset from scripts/generate-favicon.ts. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/brand/icon-40.png`}
              alt=""
              width={20}
              height={20}
              className="size-5 shrink-0"
            />
            Channel Surfer
          </h1>
          {/* The old subtitle, folded into a hover card. */}
          <div className="group relative ml-1">
            <button
              type="button"
              aria-label="About Channel Surfer"
              className="flex size-5 cursor-help items-center justify-center rounded-full border border-input font-mono text-sm text-muted-foreground group-hover:bg-muted group-hover:text-foreground"
            >
              ?
            </button>
            <div className="pointer-events-none absolute top-7 left-0 z-30 hidden w-80 flex-col gap-2 rounded-md border border-border bg-popover/95 p-4 text-base shadow-[var(--shadow-lg)] backdrop-blur-md group-hover:flex">
              <p className="font-semibold">
                How RGB and HSB channels build an image
              </p>
              <p className="text-muted-foreground">
                Nine tiles break the picture into its channels — red, green
                and blue straight from the pixels; hue, saturation and
                brightness from the color model.
              </p>
              <p className="text-muted-foreground">
                <span className="font-mono text-foreground">HSB</span>
                {" measures brightness against the strongest channel."}
              </p>
              <p className="text-muted-foreground">
                <span className="font-mono text-foreground">HSL</span>
                {" measures lightness against the mid-point. Switch models in the Inspector."}
              </p>
            </div>
          </div>
        </div>
        {/* Wraps to its own line when the window narrows. */}
        <div className="shrink-0 max-md:order-last max-md:basis-full">
          <DisplayToolbar onShowControls={() => { setPanelOpen(true); setPanelTab("inspect"); if (narrow) setLibraryOpen(false); }} />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ExportButton />

        </div>
      </header>

      <div
        className={`panel-toggle absolute z-30 overflow-hidden border border-border bg-card/95 shadow-[var(--shadow-sm)] backdrop-blur-md ${libraryOpen && !narrow ? "rounded-r-md border-l-0" : narrow && libraryOpen ? "rounded-t-md border-b-0" : "rounded-md"}`}
        style={{
          left: libraryOpen && !narrow ? LIBRARY_WIDTH + 11 : 12,
          top: narrow && libraryOpen ? windowH * (1 - SHEET_FRACTION) - 44 : headerH + 24,
        }}
      >
          <Button
            variant="ghost"
            className="panel-toggle-button rounded-none"
            size="icon"
            title={libraryOpen ? "Close media library" : "Open media library"}
            aria-label={libraryOpen ? "Close media library" : "Open media library"}
            aria-controls="media-library"
            aria-expanded={libraryOpen}
            onClick={() => setLibraryOpen((open) => !open)}
          >
            {libraryOpen ? <PanelLeftClose aria-hidden /> : <PanelLeftOpen aria-hidden />}
          </Button>
      </div>
      <div
        className={`panel-toggle absolute z-30 overflow-hidden border border-border bg-card/95 shadow-[var(--shadow-sm)] backdrop-blur-md ${inspectorVisible && !narrow ? "rounded-l-md border-r-0" : narrow && inspectorVisible ? "rounded-t-md border-b-0" : "rounded-md"}`}
        style={{
          right: inspectorVisible && !narrow ? panelWidth + 11 : 12,
          top: narrow && inspectorVisible ? windowH * (1 - SHEET_FRACTION) - 44 : headerH + 24,
        }}
      >
          <Button
            variant="ghost"
            className="panel-toggle-button rounded-none"
            size="icon"
            aria-label={inspectorVisible ? "Close panel" : "Open panel"}
            aria-controls="inspector-panel"
            aria-expanded={inspectorVisible}
            aria-pressed={inspectorVisible}
            onClick={() => {
              setPanelOpen(!inspectorVisible);
              if (narrow) setLibraryOpen(false);
            }}
          >
            {inspectorVisible ? (
              <PanelRightClose aria-hidden />
            ) : (
              <PanelRightOpen aria-hidden />
            )}
          </Button>
      </div>

      <LibraryPanel open={libraryOpen} sheet={narrow} onClose={() => setLibraryOpen(false)} />

      <InspectorPanel
          open={inspectorVisible}
          tab={panelTab}
          onTab={setPanelTab}
          onClose={() => setPanelOpen(false)}
          sheet={narrow}
        />

      {/* Color-steps strip (settings-gated) floats along the bottom. */}
      <div className="absolute inset-x-4 bottom-4 z-10">
        <ColorSteps />
      </div>

      {/* Load errors lost their footer; surface them as a chip. */}
      {error && (
        <p className="absolute bottom-4 left-4 z-10 rounded-md border border-border bg-popover/90 px-3 py-1.5 text-base text-destructive">
          {error}
        </p>
      )}

      <HexFloat />
      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-30 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-background/80">
          <p className="text-lg font-medium">Drop images to surf them</p>
        </div>
      )}
    </div>
  );
}
