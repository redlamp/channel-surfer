"use client";

import dynamic from "next/dynamic";

// WebGL + IndexedDB are client-only; skip SSR for the whole app shell.
const SurferApp = dynamic(
  () => import("@/components/surfer-app").then((m) => m.SurferApp),
  { ssr: false },
);

export default function Home() {
  return <SurferApp />;
}
