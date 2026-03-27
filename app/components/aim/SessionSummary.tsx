"use client";

import { formatAccuracyTenths } from "@/app/lib/aim/geometry";

type Props = {
  open: boolean;
  onClose: () => void;
  windowHits: number;
  windowMisses: number;
  windowAcc: number;
  quad: [number, number, number, number];
  sessionHits: number;
  sessionMisses: number;
  /** Tenths of a percent (0–1000). */
  sessionAcc: number;
};

export default function SessionSummary({
  open,
  onClose,
  windowHits,
  windowMisses,
  windowAcc,
  quad,
  sessionHits,
  sessionMisses,
  sessionAcc,
}: Props) {
  if (!open) return null;

  const qmax = Math.max(1, ...quad);
  const labels = ["Top-left", "Top-right", "Bottom-left", "Bottom-right"];

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal
      aria-labelledby="summary-title"
    >
      <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/20 bg-zinc-900/95 p-5 text-white shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2
            id="summary-title"
            className="font-(family-name:--font-display) text-lg font-semibold uppercase tracking-[0.2em]"
          >
            Session summary
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/20 px-3 py-1 text-[10px] uppercase tracking-widest text-white/70 hover:bg-white/10"
          >
            Close
          </button>
        </div>

        <section className="mb-5 space-y-2 text-sm">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/45">
            Last ~60 seconds
          </p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-white/5 px-2 py-2">
              <div className="text-[10px] text-white/50">Hits</div>
              <div className="font-(family-name:--font-display) text-xl tabular-nums">
                {windowHits}
              </div>
            </div>
            <div className="rounded-lg bg-white/5 px-2 py-2">
              <div className="text-[10px] text-white/50">Misses</div>
              <div className="font-(family-name:--font-display) text-xl tabular-nums">
                {windowMisses}
              </div>
            </div>
            <div className="rounded-lg bg-white/5 px-2 py-2">
              <div className="text-[10px] text-white/50">Accuracy</div>
              <div className="font-(family-name:--font-display) text-xl tabular-nums">
                {windowHits + windowMisses > 0
                  ? formatAccuracyTenths(windowAcc)
                  : "—"}
              </div>
            </div>
          </div>
        </section>

        <section className="mb-5">
          <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-white/45">
            Misses by field quadrant
          </p>
          <div className="grid grid-cols-2 gap-2">
            {quad.map((n, i) => (
              <div key={labels[i]} className="flex items-center gap-2">
                <span className="w-20 shrink-0 text-[10px] text-white/50">
                  {labels[i]}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-fuchsia-500/80"
                    style={{ width: `${(n / qmax) * 100}%` }}
                  />
                </div>
                <span className="w-6 text-right text-xs tabular-nums">{n}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-white/10 pt-4 text-sm">
          <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-white/45">
            Full session
          </p>
          <div className="flex justify-between gap-4 text-white/80">
            <span>Hits / Misses</span>
            <span className="tabular-nums">
              {sessionHits} / {sessionMisses}
            </span>
          </div>
          <div className="mt-1 flex justify-between gap-4 text-white/80">
            <span>Accuracy</span>
            <span className="tabular-nums">
              {sessionHits + sessionMisses > 0
                ? formatAccuracyTenths(sessionAcc)
                : "—"}
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
