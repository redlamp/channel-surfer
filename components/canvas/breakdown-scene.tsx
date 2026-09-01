"use client";

import {
  breakdownFragmentShader,
  breakdownVertexShader,
} from "@/lib/shaders/breakdown";
import { PLANE_H, type CanvasCursor } from "./geometry";
import { useSceneRef } from "./scene-state";
import { useCameraFraming } from "./use-camera-framing";
import { useImageDecode } from "./use-image-decode";
import { useKeyboardNav } from "./use-keyboard-nav";
import { useOverlayPlacement } from "./use-overlay-placement";
import { usePointerGestures } from "./use-pointer-gestures";
import { useUniformSync } from "./use-uniform-sync";

/**
 * The scene inside the R3F Canvas: one plane carrying the breakdown
 * shader, composed from the hooks in this folder. The hooks share a
 * mutable SceneState and register their useFrame callbacks in this
 * order — camera first, then uniforms, then overlay placement — so each
 * frame's uniforms and overlays see the camera they will be drawn with.
 */
export function BreakdownScene({
  blob,
  hoverTile,
  onHoverTile,
  onCursor,
  onDecoding,
}: {
  blob: Blob;
  hoverTile: number | null;
  onHoverTile: (tile: number | null) => void;
  onCursor: (cursor: CanvasCursor) => void;
  onDecoding: (busy: boolean) => void;
}) {
  const st = useSceneRef();
  const view = useImageDecode(st, blob, onDecoding);
  const texture = view?.texture ?? null;
  const aspect = view?.aspect ?? 1;

  const { frameTile, unframe } = useCameraFraming(st, aspect, texture, onCursor);
  const { materialRef, uniforms } = useUniformSync(st, texture, aspect, hoverTile);
  useOverlayPlacement(st, aspect);
  const { handlers, clearPin } = usePointerGestures(
    st,
    aspect,
    onHoverTile,
    onCursor,
    frameTile,
    unframe,
  );
  useKeyboardNav(st, frameTile, unframe, clearPin);

  if (!texture || !uniforms) return null;

  return (
    <mesh scale={[aspect * PLANE_H, PLANE_H, 1]} frustumCulled={false} {...handlers}>
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
  );
}
