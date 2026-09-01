"use client";

import { useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { MapControls } from "@react-three/drei";
import * as THREE from "three";
import { useSourceStore } from "@/stores/source-store";
import { useSettingsStore } from "@/stores/settings-store";
import { canvasBridge, useUiStore } from "@/stores/ui-store";
import {
  TileEffectMenu,
  type TileMenuState,
} from "@/components/tile-effect-menu";
import { BreakdownScene } from "@/components/canvas/breakdown-scene";
import {
  ContextBar,
  DecodeBadge,
  HexCard,
  TileTitle,
} from "@/components/canvas/canvas-overlays";
import {
  RMB_SLOP,
  barGroupOfTile,
  type BarGroup,
  type CanvasCursor,
} from "@/components/canvas/geometry";

// Crosshair with a wide center gap so the focused area stays visible
// while hue-picking; white over a black halo so it reads on any color.
// 32px canvas, ticks 2..9 / 23..30 leave a 14px clear window at center.
const RETICLE_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><g fill='none' stroke-linecap='round'><g stroke='black' stroke-width='4'><path d='M16 2v7M16 23v7M2 16h7M23 16h7'/></g><g stroke='white' stroke-width='2'><path d='M16 2v7M16 23v7M2 16h7M23 16h7'/></g></g></svg>`;
const RETICLE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(RETICLE_SVG)}") 16 16, crosshair`;

const CURSOR_CSS: Record<CanvasCursor, string> = {
  reticle: RETICLE_CURSOR,
  grabbing: "grabbing",
  hidden: "none",
};

/** Release the multi-touch flag on a delay so the trailing click still
 * sees it. */
function pointerReleased() {
  canvasBridge.pointerCount = Math.max(0, canvasBridge.pointerCount - 1);
  if (canvasBridge.pointerCount === 0)
    window.setTimeout(() => {
      canvasBridge.multiTouch = false;
    }, 120);
}

/**
 * The 3x3 breakdown grid on a pan/zoom canvas: right-drag or two fingers
 * to pan, wheel or pinch to zoom toward the cursor, single-click to pin a
 * sample, double-click a tile to frame it (again, Escape, or double-click
 * outside to return; arrows navigate; Space peeks at the source; the mask
 * button isolates), right-click a tile to swap its effect. The plane
 * keeps the source image's aspect ratio.
 *
 * This shell owns the DOM: the R3F Canvas, the overlays around it, the
 * pointer census for multi-touch, and the right-click menu. Everything
 * inside the WebGL scene lives in components/canvas/.
 */
export function BreakdownCanvas() {
  const blob = useSourceStore((s) => s.blob);
  const loadError = useSourceStore((s) => s.error);
  const setCanvasEl = useUiStore((s) => s.setCanvasEl);
  const setTileTransform = useSettingsStore((s) => s.setTileTransform);
  const [hoverTile, setHoverTile] = useState<number | null>(null);
  const [tileMenu, setTileMenu] = useState<TileMenuState | null>(null);
  const [cursor, setCursor] = useState<CanvasCursor>("reticle");
  // Latched to the last bar-carrying tile hovered (see ContextBar).
  const [barGroup, setBarGroup] = useState<BarGroup | null>(null);
  // True while a newly selected image is decoding.
  const [decoding, setDecoding] = useState(false);
  // Right-button press origin. A release within RMB_SLOP of it is a
  // click (open the effect menu); anything further was a camera pan, so
  // the menu stays shut and MapControls keeps the gesture.
  const rmbDownRef = useRef<{ x: number; y: number } | null>(null);

  if (!blob) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-base text-muted-foreground">
          {loadError ? "Drop an image to get started" : "Loading image…"}
        </p>
      </div>
    );
  }

  const onHoverTile = (t: number | null) => {
    setHoverTile(t);
    // Mirrored into the UI store for the inspector and the hexagon ring.
    useUiStore.getState().setHoverTile(t);
    if (t !== null) {
      const g = barGroupOfTile(useSettingsStore.getState().tileLayout, t);
      if (g !== null) setBarGroup(g);
    }
  };

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ cursor: CURSOR_CSS[cursor] }}
      onContextMenu={(e) => e.preventDefault()}
      // Capture-phase pointer census: a second finger means the gesture
      // belongs to the camera (two-finger pan/pinch), never the pin.
      onPointerDownCapture={(e) => {
        canvasBridge.pointerCount += 1;
        if (canvasBridge.pointerCount > 1) canvasBridge.multiTouch = true;
        if (e.button === 2) rmbDownRef.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUpCapture={(e) => {
        if (e.button === 2) {
          const down = rmbDownRef.current;
          rmbDownRef.current = null;
          const moved =
            !down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > RMB_SLOP;
          if (!moved && hoverTile !== null) {
            const r = e.currentTarget.getBoundingClientRect();
            setTileMenu({
              x: e.clientX - r.left,
              y: e.clientY - r.top,
              tile: hoverTile,
              current: useSettingsStore.getState().tileLayout[hoverTile],
            });
          }
        }
        pointerReleased();
      }}
      onPointerCancelCapture={pointerReleased}
      onDoubleClick={() => {
        // A double-click the mesh already handled arrives here ~instantly
        // after; anything else was outside the tiles — recenter the view.
        if (performance.now() - canvasBridge.meshDblAt < 100) return;
        canvasBridge.refit?.();
      }}
    >
      {decoding && <DecodeBadge />}

      {tileMenu && (
        <TileEffectMenu
          state={tileMenu}
          onPick={setTileTransform}
          onClose={() => setTileMenu(null)}
        />
      )}
      <Canvas
        orthographic
        camera={{ position: [0, 0, 5], zoom: 300, near: 0.1, far: 10 }}
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ antialias: false, preserveDrawingBuffer: true }}
        onCreated={({ gl }) => setCanvasEl(gl.domElement)}
      >
        <BreakdownScene
          blob={blob}
          hoverTile={hoverTile}
          onHoverTile={onHoverTile}
          onCursor={setCursor}
          onDecoding={setDecoding}
        />
        <MapControls
          makeDefault
          enableRotate={false}
          screenSpacePanning
          zoomToCursor
          enableDamping={false}
          minZoom={40}
          maxZoom={20000}
          // Touch: one finger stays free for color sampling (pointer
          // events reach the mesh); two fingers pan and pinch-zoom.
          touches={{
            ONE: -1 as unknown as THREE.TOUCH,
            TWO: THREE.TOUCH.DOLLY_PAN,
          }}
          // Mouse: RIGHT drags the canvas; LEFT is freed to move the
          // selection loop (context menu is suppressed on the wrapper).
          mouseButtons={{
            LEFT: -1 as unknown as THREE.MOUSE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN,
          }}
        />
      </Canvas>

      <TileTitle hoverTile={hoverTile} />
      <HexCard />
      <ContextBar group={barGroup} />
    </div>
  );
}
