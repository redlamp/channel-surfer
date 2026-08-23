"use client";

import { useEffect, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { MapControls } from "@react-three/drei";
import * as THREE from "three";
import {
  breakdownFragmentShader,
  breakdownVertexShader,
} from "@/lib/shaders/breakdown";
import { useSourceStore } from "@/stores/source-store";

/** World-space height of the 3x3 grid plane; width is aspect x this. */
const PLANE_H = 1;

function BreakdownQuad({ url, aspect }: { url: string; aspect: number }) {
  const invalidate = useThree((s) => s.invalidate);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

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

  // Request a demand-mode frame only after the textured mesh has committed;
  // invalidating from the loader callback renders before the mesh exists.
  useEffect(() => {
    if (!texture) return;
    invalidate();
    return () => texture.dispose();
  }, [texture, invalidate]);

  if (!texture) return null;

  return (
    <mesh scale={[aspect * PLANE_H, PLANE_H, 1]} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      {/* Remount the material per texture so the uniform stays in sync. */}
      <shaderMaterial
        key={texture.uuid}
        vertexShader={breakdownVertexShader}
        fragmentShader={breakdownFragmentShader}
        uniforms={{ uSource: { value: texture } }}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

/** Refit the view when a new image (aspect) arrives. */
function FitView({ aspect }: { aspect: number }) {
  const get = useThree((s) => s.get);

  // Reads the store imperatively so the effect refits only when the image
  // changes — a window resize must not yank a view the user has panned.
  useEffect(() => {
    const { camera, size, controls, invalidate } = get();
    const ctl = controls as {
      target?: THREE.Vector3;
      saveState?: () => void;
    } | null;
    camera.position.set(0, 0, 5);
    ctl?.target?.set(0, 0, 0);
    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom =
        Math.min(size.width / (aspect * PLANE_H), size.height / PLANE_H) * 0.94;
      camera.updateProjectionMatrix();
    }
    ctl?.saveState?.();
    invalidate();
  }, [aspect, get]);

  return null;
}

/**
 * The 3x3 breakdown grid on a pan/zoom canvas: drag to pan, wheel to zoom
 * toward the cursor (Figma-style). The plane keeps the source image's
 * aspect ratio; the canvas just fills whatever space the parent grants.
 */
export function BreakdownCanvas() {
  const url = useSourceStore((s) => s.url);
  const width = useSourceStore((s) => s.width);
  const height = useSourceStore((s) => s.height);

  if (!url) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-base text-muted-foreground">Loading image…</p>
      </div>
    );
  }

  const aspect = width / height;

  return (
    <div className="h-full w-full cursor-grab overflow-hidden rounded-md border border-border active:cursor-grabbing">
      <Canvas
        orthographic
        camera={{ position: [0, 0, 5], zoom: 300, near: 0.1, far: 10 }}
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ antialias: false, preserveDrawingBuffer: true }}
      >
        <BreakdownQuad url={url} aspect={aspect} />
        <FitView aspect={aspect} />
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
    </div>
  );
}
