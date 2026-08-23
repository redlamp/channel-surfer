"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import {
  DEMO_ID,
  useSourceStore,
  type MediaItem,
} from "@/stores/source-store";
import {
  formatBytes,
  probeImageDetails,
  type ImageDetails,
} from "@/lib/image-details";
import { cn } from "@/lib/utils";

function LibraryRow({
  name,
  meta,
  url,
  selected,
  onSelect,
  onRemove,
}: {
  name: string;
  meta: string;
  url: string;
  selected: boolean;
  onSelect: () => void;
  onRemove?: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex w-full cursor-pointer items-center gap-2.5 rounded-md border p-1.5 text-left transition-colors",
        selected
          ? "border-ring bg-muted"
          : "border-transparent hover:bg-muted/60",
      )}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {/* Blob object URL — next/image has nothing to optimize here. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        className="size-12 shrink-0 rounded-sm border border-border bg-surface-inset object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base leading-tight">{name}</p>
        <p className="font-mono text-base leading-tight text-muted-foreground">
          {meta}
        </p>
      </div>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${name}`}
          className="cursor-pointer rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-base text-muted-foreground">{label}</dt>
      <dd className="text-right font-mono text-base">{value}</dd>
    </div>
  );
}

function SelectionDetails() {
  const currentId = useSourceStore((s) => s.currentId);
  const items = useSourceStore((s) => s.items);
  const demoBlob = useSourceStore((s) => s.demoBlob);
  const name = useSourceStore((s) => s.name);
  const width = useSourceStore((s) => s.width);
  const height = useSourceStore((s) => s.height);

  const blob =
    currentId === DEMO_ID
      ? demoBlob
      : (items.find((i) => i.id === currentId)?.blob ?? null);
  const size = blob?.size ?? null;

  // Details arrive async; tagging them with their id lets render discard
  // stale results instead of clearing state synchronously in the effect.
  const [probed, setProbed] = useState<{
    id: string;
    details: ImageDetails;
  } | null>(null);

  useEffect(() => {
    if (!blob) return;
    let cancelled = false;
    void probeImageDetails(blob).then((details) => {
      if (!cancelled) setProbed({ id: currentId, details });
    });
    return () => {
      cancelled = true;
    };
  }, [blob, currentId]);

  const details = probed?.id === currentId ? probed.details : null;

  const megapixels = ((width * height) / 1_000_000).toFixed(
    width * height >= 10_000_000 ? 0 : 1,
  );

  return (
    <div className="space-y-1.5 px-3 py-2.5">
      <p className="truncate text-base font-medium" title={name}>
        {name}
      </p>
      <dl className="space-y-0.5">
        <DetailRow
          label="Resolution"
          value={`${width}×${height} (${megapixels} MP)`}
        />
        {details && <DetailRow label="Format" value={details.format} />}
        {details && details.colorMode !== "—" && (
          <DetailRow label="Color mode" value={details.colorMode} />
        )}
        {details?.bitDepth != null && (
          <DetailRow label="Bit depth" value={`${details.bitDepth}-bit`} />
        )}
        {details?.progressive != null && (
          <DetailRow
            label="Encoding"
            value={details.progressive ? "Progressive" : "Baseline"}
          />
        )}
        {size != null && (
          <DetailRow label="File size" value={formatBytes(size)} />
        )}
      </dl>
    </div>
  );
}

/** Right-side library: every image dropped into the app, plus the demo,
 * with header-parsed details for the current selection. */
export function LibraryPanel() {
  const items = useSourceStore((s) => s.items);
  const currentId = useSourceStore((s) => s.currentId);
  const select = useSourceStore((s) => s.select);
  const remove = useSourceStore((s) => s.remove);
  const resetToDemo = useSourceStore((s) => s.resetToDemo);
  const demoUrl = useSourceStore((s) => (s.isDemo ? s.url : null));

  return (
    <aside className="flex w-72 shrink-0 flex-col overflow-hidden rounded-md border border-border bg-card shadow-[var(--shadow-sm)]">
      <div className="flex items-baseline justify-between border-b border-border px-3 py-2">
        <h2 className="text-base font-semibold">Library</h2>
        <span className="font-mono text-base text-muted-foreground">
          {items.length} {items.length === 1 ? "image" : "images"}
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1.5">
        {[...items].reverse().map((item: MediaItem) => (
          <LibraryRow
            key={item.id}
            name={item.name}
            meta={`${item.width}×${item.height}`}
            url={item.url}
            selected={item.id === currentId}
            onSelect={() => select(item.id)}
            onRemove={() => void remove(item.id)}
          />
        ))}
        <LibraryRow
          name="SMPTE bars"
          meta="demo"
          url={demoUrl ?? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/demo/smpte-bars.png`}
          selected={currentId === DEMO_ID}
          onSelect={resetToDemo}
        />
        {items.length === 0 && (
          <p className="px-2 py-3 text-base text-muted-foreground">
            Drop images anywhere to build your library.
          </p>
        )}
      </div>

      <Separator />
      <SelectionDetails />
    </aside>
  );
}
