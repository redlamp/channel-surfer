"use client";

import { create } from "zustand";
import {
  idbClearCurrent,
  idbGetCurrent,
  idbPutCurrent,
} from "@/lib/idb";

const DEMO_PATH = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/demo/smpte-bars.png`;
const DEMO_NAME = "SMPTE bars (demo)";

interface SourceState {
  /** Object URL for the current image, null until hydrated. */
  url: string | null;
  width: number;
  height: number;
  name: string;
  isDemo: boolean;
  error: string | null;
  /** Restore the persisted image, or fall back to the demo. */
  hydrate: () => Promise<void>;
  loadFile: (file: File) => Promise<void>;
  resetToDemo: () => Promise<void>;
}

/** Intrinsic pixel size; also validates that the blob decodes as an image. */
async function probeImage(blob: Blob): Promise<{ width: number; height: number }> {
  const bmp = await createImageBitmap(blob);
  const size = { width: bmp.width, height: bmp.height };
  bmp.close();
  return size;
}

let activeUrl: string | null = null;
function swapObjectUrl(blob: Blob): string {
  if (activeUrl) URL.revokeObjectURL(activeUrl);
  activeUrl = URL.createObjectURL(blob);
  return activeUrl;
}

async function fetchDemo() {
  const blob = await fetch(DEMO_PATH).then((r) => r.blob());
  const { width, height } = await probeImage(blob);
  return { url: swapObjectUrl(blob), width, height, name: DEMO_NAME, isDemo: true };
}

export const useSourceStore = create<SourceState>((set) => ({
  url: null,
  width: 1,
  height: 1,
  name: "",
  isDemo: true,
  error: null,

  hydrate: async () => {
    try {
      const rec = await idbGetCurrent();
      if (rec) {
        const url = swapObjectUrl(rec.blob);
        set({ url, width: rec.width, height: rec.height, name: rec.name, isDemo: false });
        return;
      }
    } catch {
      // Unreadable store — fall through to the demo image.
    }
    set(await fetchDemo());
  },

  loadFile: async (file) => {
    try {
      const { width, height } = await probeImage(file);
      // Persist best-effort; the in-memory image works even if IDB fails.
      void idbPutCurrent({ blob: file, name: file.name, width, height }).catch(
        () => {},
      );
      set({
        url: swapObjectUrl(file),
        width,
        height,
        name: file.name,
        isDemo: false,
        error: null,
      });
    } catch {
      set({ error: `Couldn't read "${file.name}" as an image.` });
    }
  },

  resetToDemo: async () => {
    await idbClearCurrent().catch(() => {});
    set({ ...(await fetchDemo()), error: null });
  },
}));
