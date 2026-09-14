import * as THREE from "three";
import { breakdownFragmentShader, breakdownVertexShader } from "@/lib/shaders/breakdown";
import { TILE_TRANSFORMS } from "@/lib/tile-transforms";
import { useSettingsStore } from "@/stores/settings-store";
import { HUE_STYLE_INDEX } from "@/components/canvas/geometry";

/** Render the complete grid into a separate target without touching the live camera. */
export async function exportBreakdown(
  renderer: THREE.WebGLRenderer,
  sourceUniforms: Record<string, THREE.IUniform>,
  aspect: number,
  longEdge: number,
  names: boolean,
): Promise<Blob> {
  const gl = renderer.getContext();
  const limit = Math.min(renderer.capabilities.maxTextureSize, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), 8192);
  if (!Number.isFinite(longEdge) || longEdge < 3 || longEdge > limit)
    throw new Error(`Choose an export size between 3 and ${limit}px.`);
  const width = Math.max(3, Math.round(aspect >= 1 ? longEdge : longEdge * aspect));
  const height = Math.max(3, Math.round(aspect >= 1 ? longEdge / aspect : longEdge));
  const settings = useSettingsStore.getState();
  // New uniform containers: rendering never mutates live values or source textures.
  const uniforms = Object.fromEntries(Object.entries(sourceUniforms).map(([key, uniform]) => [key, { value: uniform.value }]));
  const assign = (key: string, value: unknown) => { uniforms[key] = { value }; };
  for (const key of ["uHoverTile", "uPinnedTile", "uIsolateTile", "uPeekTile"]) assign(key, -1);
  for (const key of ["uPinUv", "uHoverUv"]) assign(key, new THREE.Vector2(-1, -1));
  assign("uUvPerPx", new THREE.Vector2(3 / width, 3 / height));
  assign("uColorModel", settings.colorModel === "hsl" ? 1 : 0);
  assign("uSrgbMath", settings.colorMath === "srgb" ? 1 : 0);
  assign("uRgbColorize", settings.rgbColorize ? 1 : 0);
  assign("uChromaColorize", settings.chromaColorize ? 1 : 0);
  assign("uChromaSmooth", settings.chromaSmooth ? 1 : 0);
  assign("uWarmCoolShade", settings.warmCoolShade ? 1 : 0);
  assign("uHueMapStyle", HUE_STYLE_INDEX[settings.hueMapStyle]);
  assign("uNeutralTol", settings.neutralTolerance);
  assign("uMidLevel", settings.midLevel);
  assign("uTileTransform", settings.tileLayout.map((key) => TILE_TRANSFORMS[key].id));
  assign("uHueSettings", settings.hueTiles.map((h) => new THREE.Vector3(h.saturation === "original" ? -1 : h.saturation, h.flat ? 1 : 0, h.brightness)));
  const target = new THREE.WebGLRenderTarget(width, height, { depthBuffer: false, stencilBuffer: false });
  const geometry = new THREE.PlaneGeometry(aspect, 1);
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: breakdownVertexShader, fragmentShader: breakdownFragmentShader, depthTest: false, depthWrite: false });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(geometry, material));
  const camera = new THREE.OrthographicCamera(-aspect / 2, aspect / 2, 0.5, -0.5, 0.1, 10);
  camera.position.z = 1;
  const previousTarget = renderer.getRenderTarget();
  const pixels = new Uint8Array(width * height * 4);
  try {
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
  } finally {
    renderer.setRenderTarget(previousTarget);
    target.dispose(); geometry.dispose(); material.dispose();
  }
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create the export image.");
  const data = ctx.createImageData(width, height);
  for (let row = 0; row < height; row++) {
    const start = (height - row - 1) * width * 4;
    data.data.set(pixels.subarray(start, start + width * 4), row * width * 4);
  }
  ctx.putImageData(data, 0, 0);
  if (names) {
    await document.fonts.ready;
    const fontSize = Math.max(12, Math.round(longEdge / 90));
    ctx.font = `${fontSize}px "Share Tech Mono", monospace`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    settings.tileLayout.forEach((key, tile) => {
      const label = TILE_TRANSFORMS[key].name;
      const x = (tile % 3 + 0.5) * width / 3;
      const y = Math.floor(tile / 3) * height / 3 + fontSize * 1.2;
      const textWidth = Math.min(ctx.measureText(label).width, width / 3 - 24);
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillRect(x - textWidth / 2 - 8, y - fontSize * 0.75, textWidth + 16, fontSize * 1.5);
      ctx.fillStyle = "black";
      ctx.fillText(label, x, y, width / 3 - 24);
    });
  }
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG export failed.")), "image/png"));
}
