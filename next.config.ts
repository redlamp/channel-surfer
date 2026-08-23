import type { NextConfig } from "next";

// GH Pages static export is opt-in so local dev serves at root.
// The deploy workflow sets NEXT_OUTPUT_EXPORT=1 and NEXT_PUBLIC_BASE_PATH=/channel-surfer.
const isExport = process.env.NEXT_OUTPUT_EXPORT === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  // R3F allocates a WebGL context per mount; StrictMode's dev double-mount
  // disposes it and blanks the canvas.
  reactStrictMode: false,
  ...(isExport
    ? {
        output: "export" as const,
        basePath,
        assetPrefix: basePath,
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
