/**
 * The scene's per-frame mutable state, shared by the hooks in this folder.
 * One plain object held in a ref: it changes on pointer events and inside
 * useFrame, never from render, so none of it is React state. Each hook
 * documents which fields it owns; the rest are read-only to it.
 */
import { useRef, type RefObject } from "react";
import { DEFAULT_TARGET_HUE, type ViewGoal } from "./geometry";

export interface Uv {
  u: number;
  v: number;
}

export interface SceneState {
  /* --- image decode (use-image-decode) --- */
  /** 2D context over the decoded image for on-demand 1x1 readouts. */
  readCtx: { ctx: CanvasRenderingContext2D; width: number; height: number } | null;

  /* --- camera framing (use-camera-framing) --- */
  viewGoal: ViewGoal | null;
  /** Tile currently framed, or null in grid view. */
  zoomedTile: number | null;
  /** Camera zoom at which the current framing landed. */
  framedZoom: number;

  /* --- pointer gestures (use-pointer-gestures) --- */
  hueGoal: number;
  hoverUv: Uv | null;
  pinUv: Uv | null;
  peek: boolean;
  clickTimer: number | null;
  pinDrag: boolean;
  pointerPos: { x: number; y: number } | null;
  lastTap: { t: number; x: number; y: number } | null;
  loopDown: { x: number; y: number } | null;

  /* --- uniform sync (use-uniform-sync) --- */
  hoverTile: number | null;
  rgbColorizeGoal: number;
  chromaColorizeGoal: number;

  /* --- overlay placement (use-overlay-placement) --- */
  lastBarTile: number | null;
  lastBarHoverAt: number;
  hexCardPos: { x: number; y: number } | null;
}

/** The state travels between hooks as a ref: the React Compiler lint
 * forbids mutating a plain hook argument, and only lets `.current` be
 * written from effects, handlers, and frame callbacks — which is exactly
 * where this state changes. Never read it during render. */
export type SceneRef = RefObject<SceneState>;

export function useSceneRef(): SceneRef {
  return useRef<SceneState>({
    readCtx: null,
    viewGoal: null,
    zoomedTile: null,
    framedZoom: 0,
    hueGoal: DEFAULT_TARGET_HUE,
    hoverUv: null,
    pinUv: null,
    peek: false,
    clickTimer: null,
    pinDrag: false,
    pointerPos: null,
    lastTap: null,
    loopDown: null,
    hoverTile: null,
    rgbColorizeGoal: 0,
    chromaColorizeGoal: 0,
    lastBarTile: null,
    lastBarHoverAt: 0,
    hexCardPos: null,
  });
}
