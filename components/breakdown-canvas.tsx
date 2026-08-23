"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import { MapControls } from "@react-three/drei";
import * as THREE from "three";
import {
  breakdownFragmentShader,
  breakdownVertexShader,
} from "@/lib/shaders/breakdown";
import { useSourceStore } from "@/stores/source-store";
import { useSettingsStore } from "@/stores/settings-store";

/** World-space height of the 3x3 grid plane; width is aspect x this. */
const PLANE_H = 1;
const FIT_MARGIN = 0.94;
/** Resting hue-map target: 180 degrees. */
const DEFAULT_TARGET_HUE = 0.5;
/** Tile index of the hue map (row 2, col 1 in the grid). */
const HUE_MAP_TILE = 3;
/** Bottom row: the R/G/B channel tiles. */
const RGB_TILES = [6, 7, 8];
/** A click that waits this long with no second click is a single click. */
const CLICK_DELAY_MS = 250;

interface ViewGoal {
  x: number;
  y: number;
  zoom: number;
}

function fitAllZoom(size: { width: number; height: number }, aspect: number) {
  return (
    Math.min(size.width / (aspect * PLANE_H), size.height / PLANE_H) *
    FIT_MARGIN
  );
}

/** Center and size of a tile (0..8, row-major from top-left) in world units. */
function tileRect(tile: number, aspect: number) {
  const w = aspect * PLANE_H;
  const h = PLANE_H;
  const col = tile % 3;
  const row = Math.floor(tile / 3);
  return {
    cx: -w / 2 + ((col + 0.5) * w) / 3,
    cy: h / 2 - ((row + 0.5) * h) / 3,
    w: w / 3,
    h: h / 3,
  };
}

/** Tile index + intra-tile UV (v up) from a whole-plane UV. */
function tileFromUv(uv: THREE.Vector2) {
  const gx = Math.min(Math.floor(uv.x * 3), 2);
  const gyFromBottom = Math.min(Math.floor(uv.y * 3), 2);
  return {
    tile: (2 - gyFromBottom) * 3 + gx,
    u: uv.x * 3 - gx,
    v: uv.y * 3 - gyFromBottom,
  };
}

function srgbToLinear(c8: number) {
  const c = c8 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Hue of an sRGB pixel, computed in linear light like the shader; null for greys. */
function pixelHue(data: Uint8ClampedArray, i: number): number | null {
  const r = srgbToLinear(data[i]);
  const g = srgbToLinear(data[i + 1]);
  const b = srgbToLinear(data[i + 2]);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;
  if (diff === 0) return null;
  let h;
  if (max === r) h = (g - b) / diff;
  else if (max === g) h = 2 + (b - r) / diff;
  else h = 4 + (r - g) / diff;
  h /= 6;
  return h < 0 ? h + 1 : h;
}

/** Hover outline width in screen pixels (drawn in the fragment shader). */
const OUTLINE_PX = 2;

function BreakdownScene({
  url,
  aspect,
  hoverTile,
  onHoverTile,
}: {
  url: string;
  aspect: number;
  hoverTile: number | null;
  onHoverTile: (tile: number | null) => void;
}) {
  const get = useThree((s) => s.get);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useThree((s) => s.controls);

  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const imageDataRef = useRef<ImageData | null>(null);
  const hueGoalRef = useRef(DEFAULT_TARGET_HUE);
  const viewGoalRef = useRef<ViewGoal | null>(null);
  const zoomedTileRef = useRef<number | null>(null);
  const rgbColorizeGoalRef = useRef(0);
  const hoverTileRef = useRef<number | null>(null);
  const clickTimerRef = useRef<number | null>(null);

  // Settings drive shader behavior: colorize cross-fades via the tween
  // loop, and the hover ref feeds the outline uniform each frame.
  const rgbColorize = useSettingsStore((s) => s.rgbColorize);
  useEffect(() => {
    rgbColorizeGoalRef.current = rgbColorize ? 1 : 0;
    invalidate();
  }, [rgbColorize, invalidate]);

  useEffect(() => {
    hoverTileRef.current = hoverTile;
    invalidate();
  }, [hoverTile, invalidate]);

  useEffect(
    () => () => {
      if (clickTimerRef.current !== null)
        window.clearTimeout(clickTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    new THREE.TextureLoader().load(url, (tex) => {
      if (cancelled) {
        tex.dispose();
        return;
      }
      // sRGB tag means shader samples arrive linear (the shader converts
      // back to sRGB explicitly at the end, matching the original HLSL).
      tex.colorSpace = THREE.SRGBColorSpace;
      // Nearest magnification: zoomed-in tiles show crisp source pixels.
      tex.magFilter = THREE.NearestFilter;
      setTexture(tex);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  // CPU-side copy of the image so pointer moves can read the hovered
  // pixel's hue without a GPU readback.
  useEffect(() => {
    imageDataRef.current = null;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      imageDataRef.current = ctx.getImageData(0, 0, c.width, c.height);
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  // Request a demand-mode frame only after the textured mesh has committed;
  // invalidating from the loader callback renders before the mesh exists.
  // Also re-sync the colorize mode onto the freshly remounted material.
  useEffect(() => {
    if (!texture) return;
    const mat = materialRef.current;
    if (mat) mat.uniforms.uRgbColorize.value = rgbColorizeGoalRef.current;
    invalidate();
    return () => texture.dispose();
  }, [texture, invalidate]);

  // Fit the view when a new image arrives; reads the store imperatively so
  // a window resize never yanks a view the user has panned.
  useEffect(() => {
    const { camera, size, controls: ctl } = get();
    const c = ctl as {
      target?: THREE.Vector3;
      saveState?: () => void;
    } | null;
    zoomedTileRef.current = null;
    viewGoalRef.current = null;
    hueGoalRef.current = DEFAULT_TARGET_HUE;
    camera.position.set(0, 0, 5);
    c?.target?.set(0, 0, 0);
    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom = fitAllZoom(size, aspect);
      camera.updateProjectionMatrix();
    }
    c?.saveState?.();
    invalidate();
  }, [aspect, get, invalidate]);

  // A user grabbing the controls takes over from any in-flight camera tween.
  useEffect(() => {
    if (!controls) return;
    const cancel = () => {
      viewGoalRef.current = null;
    };
    const ctl = controls as unknown as THREE.EventDispatcher<{
      start: object;
    }>;
    ctl.addEventListener("start", cancel);
    return () => ctl.removeEventListener("start", cancel);
  }, [controls]);

  // Tween engine: hue target easing + double-click camera framing. Runs
  // only while frames are requested; keeps invalidating until settled.
  useFrame((state, dt) => {
    let active = false;

    const mat = materialRef.current;
    if (mat) {
      // Hover outline: tile index plus a constant-screen-width edge, both
      // refreshed every rendered frame (zoom changes arrive here too).
      mat.uniforms.uHoverTile.value = hoverTileRef.current ?? -1;
      if (state.camera instanceof THREE.OrthographicCamera) {
        const worldPerPx = 1 / state.camera.zoom;
        mat.uniforms.uOutlineUv.value.set(
          (OUTLINE_PX * worldPerPx) / ((aspect * PLANE_H) / 3),
          (OUTLINE_PX * worldPerPx) / (PLANE_H / 3),
        );
      }
      // Hue target snaps (no tween) — Taylor found the ease distracting.
      mat.uniforms.uTargetHue.value = hueGoalRef.current;

      const mixCur = mat.uniforms.uRgbColorize.value as number;
      const mixGoal = rgbColorizeGoalRef.current;
      if (Math.abs(mixGoal - mixCur) > 0.002) {
        const k = 1 - Math.exp(-12 * dt);
        mat.uniforms.uRgbColorize.value = mixCur + (mixGoal - mixCur) * k;
        active = true;
      } else if (mixCur !== mixGoal) {
        mat.uniforms.uRgbColorize.value = mixGoal;
      }
    }

    const goal = viewGoalRef.current;
    if (goal && state.camera instanceof THREE.OrthographicCamera) {
      const camera = state.camera;
      const k = 1 - Math.exp(-8 * dt);
      camera.position.x += (goal.x - camera.position.x) * k;
      camera.position.y += (goal.y - camera.position.y) * k;
      camera.zoom += (goal.zoom - camera.zoom) * k;
      const settled =
        Math.abs(goal.x - camera.position.x) < 1e-4 &&
        Math.abs(goal.y - camera.position.y) < 1e-4 &&
        Math.abs(goal.zoom - camera.zoom) / goal.zoom < 1e-3;
      if (settled) {
        camera.position.set(goal.x, goal.y, camera.position.z);
        camera.zoom = goal.zoom;
        viewGoalRef.current = null;
      }
      camera.updateProjectionMatrix();
      const ctl = state.controls as unknown as {
        target?: THREE.Vector3;
      } | null;
      ctl?.target?.set(camera.position.x, camera.position.y, 0);
      active = true;
    }

    if (active) invalidate();
  });

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!e.uv) return;
    const { tile, u, v } = tileFromUv(e.uv);
    onHoverTile(tile);
    const mode = useSettingsStore.getState().highlightMode;
    const picking =
      mode === "all" || (mode === "tile" && tile === HUE_MAP_TILE);
    if (picking && imageDataRef.current) {
      const id = imageDataRef.current;
      const px = Math.min(Math.floor(u * id.width), id.width - 1);
      const py = Math.min(Math.floor((1 - v) * id.height), id.height - 1);
      const h = pixelHue(id.data, (py * id.width + px) * 4);
      // Greys have no hue — hold the current target rather than jumping.
      if (h !== null) hueGoalRef.current = h;
    } else {
      hueGoalRef.current = DEFAULT_TARGET_HUE;
    }
    invalidate();
  };

  const onPointerOut = () => {
    onHoverTile(null);
    hueGoalRef.current = DEFAULT_TARGET_HUE;
    invalidate();
  };

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    // Ignore drag-release "clicks" (delta = px between down and up).
    if (!e.uv || e.delta > 4) return;
    const { tile } = tileFromUv(e.uv);
    if (!RGB_TILES.includes(tile)) return;
    // Hold fire briefly so a double-click (framing) doesn't also toggle.
    if (clickTimerRef.current !== null)
      window.clearTimeout(clickTimerRef.current);
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      const s = useSettingsStore.getState();
      s.setRgbColorize(!s.rgbColorize);
    }, CLICK_DELAY_MS);
  };

  const frameTile = useCallback(
    (tile: number, snap = false) => {
      const { size, camera, controls } = get();
      zoomedTileRef.current = tile;
      const r = tileRect(tile, aspect);
      const zoom = Math.min(size.width / r.w, size.height / r.h);
      if (snap && camera instanceof THREE.OrthographicCamera) {
        viewGoalRef.current = null;
        camera.position.set(r.cx, r.cy, camera.position.z);
        camera.zoom = zoom;
        camera.updateProjectionMatrix();
        (controls as { target?: THREE.Vector3 } | null)?.target?.set(
          r.cx,
          r.cy,
          0,
        );
      } else {
        viewGoalRef.current = { x: r.cx, y: r.cy, zoom };
      }
      invalidate();
    },
    [aspect, get, invalidate],
  );

  const onDoubleClick = (e: ThreeEvent<MouseEvent>) => {
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    if (!e.uv) return;
    const { tile } = tileFromUv(e.uv);
    if (zoomedTileRef.current === tile) {
      zoomedTileRef.current = null;
      viewGoalRef.current = {
        x: 0,
        y: 0,
        zoom: fitAllZoom(get().size, aspect),
      };
      invalidate();
    } else {
      frameTile(tile);
    }
  };

  // While framed on a tile, arrow keys step to the neighbor in the grid.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (zoomedTileRef.current === null) return;
      // Leave keys alone when a form control (e.g. the settings sheet) has
      // focus.
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(t.tagName))
      )
        return;
      const deltas: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const d = deltas[e.key];
      if (!d) return;
      // Swallow the key even at the grid edge so the page never scrolls.
      e.preventDefault();
      const cur = zoomedTileRef.current;
      const col = Math.min(Math.max((cur % 3) + d[0], 0), 2);
      const row = Math.min(Math.max(Math.floor(cur / 3) + d[1], 0), 2);
      const next = row * 3 + col;
      // Snap, per Taylor — no camera tween on keyboard navigation.
      if (next !== cur) frameTile(next, true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [frameTile]);

  // One stable uniforms object per texture. An inline object literal here
  // is a NEW identity every render, so any re-render (e.g. hover state)
  // made R3F re-apply the prop and reset every uniform to its initial
  // value — uRgbColorize snapped to 0 and faded back up, which read as a
  // flicker on the RGB tiles whenever the cursor crossed tiles.
  const uniforms = useMemo(
    () =>
      texture
        ? {
            uSource: { value: texture },
            uTargetHue: { value: DEFAULT_TARGET_HUE },
            uRgbColorize: { value: 0 },
            uHoverTile: { value: -1 },
            uOutlineUv: { value: new THREE.Vector2() },
          }
        : null,
    [texture],
  );

  if (!texture || !uniforms) return null;

  return (
    <>
      <mesh
        scale={[aspect * PLANE_H, PLANE_H, 1]}
        frustumCulled={false}
        onPointerMove={onPointerMove}
        onPointerOut={onPointerOut}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      >
        <planeGeometry args={[1, 1]} />
        {/* Remount the material per texture so the uniform stays in sync. */}
        <shaderMaterial
          key={texture.uuid}
          ref={materialRef}
          vertexShader={breakdownVertexShader}
          fragmentShader={breakdownFragmentShader}
          uniforms={uniforms}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}

const TILE_NAMES = [
  "Source",
  "Hue · mid saturation",
  "Hue · max saturation",
  "Hue map",
  "Saturation",
  "Brightness",
  "Red",
  "Green",
  "Blue",
];

// Crosshair with a wide center gap so the focused area stays visible
// while hue-picking; white over a black halo so it reads on any color.
// 32px canvas, ticks 2..9 / 23..30 leave a 14px clear window at center.
const RETICLE_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><g fill='none' stroke-linecap='round'><g stroke='black' stroke-width='4'><path d='M16 2v7M16 23v7M2 16h7M23 16h7'/></g><g stroke='white' stroke-width='2'><path d='M16 2v7M16 23v7M2 16h7M23 16h7'/></g></g></svg>`;
const RETICLE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(RETICLE_SVG)}") 16 16, crosshair`;

/**
 * The 3x3 breakdown grid on a pan/zoom canvas: drag to pan, wheel to zoom
 * toward the cursor (Figma-style), double-click a tile to frame it (and
 * again to return). Hovering a tile outlines it and names it in a floating
 * label; hovering the hue-map tile retargets the hue map to the pixel
 * under the cursor, easing back to 180 degrees on leave. The plane keeps
 * the source image's aspect ratio.
 */
export function BreakdownCanvas() {
  const url = useSourceStore((s) => s.url);
  const width = useSourceStore((s) => s.width);
  const height = useSourceStore((s) => s.height);
  const highlightMode = useSettingsStore((s) => s.highlightMode);
  const [hoverTile, setHoverTile] = useState<number | null>(null);

  const picking =
    hoverTile !== null &&
    (highlightMode === "all" ||
      (highlightMode === "tile" && hoverTile === HUE_MAP_TILE));

  if (!url) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-base text-muted-foreground">Loading image…</p>
      </div>
    );
  }

  return (
    <div
      className="relative h-full w-full cursor-grab overflow-hidden rounded-md border border-border active:cursor-grabbing"
      style={picking ? { cursor: RETICLE_CURSOR } : undefined}
    >
      <Canvas
        orthographic
        camera={{ position: [0, 0, 5], zoom: 300, near: 0.1, far: 10 }}
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ antialias: false, preserveDrawingBuffer: true }}
      >
        <BreakdownScene
          url={url}
          aspect={width / height}
          hoverTile={hoverTile}
          onHoverTile={setHoverTile}
        />
        <MapControls
          makeDefault
          enableRotate={false}
          screenSpacePanning
          zoomToCursor
          enableDamping={false}
          minZoom={40}
          maxZoom={20000}
        />
      </Canvas>
      <div
        className={`pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-md border border-border bg-popover/90 px-3 py-1 font-mono text-base shadow-[var(--shadow-md)] transition-opacity duration-150 ${
          hoverTile === null ? "opacity-0" : "opacity-100"
        }`}
        aria-live="polite"
      >
        {hoverTile !== null ? TILE_NAMES[hoverTile] : " "}
      </div>
    </div>
  );
}
