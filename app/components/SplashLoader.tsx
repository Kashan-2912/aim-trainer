"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const SPLASH_SEEN_KEY = "pulse-grid-splash-seen";

type Phase = "loading" | "exiting" | "done";

export default function SplashLoader({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("loading");
  /** When false, splash overlay is not mounted — avoids 1-frame flash on refresh after localStorage skip. */
  const [splashGateReady, setSplashGateReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Read localStorage before paint; only then mount splash (first visit) or skip it entirely (returning). */
  useLayoutEffect(() => {
    try {
      if (localStorage.getItem(SPLASH_SEEN_KEY) === "1") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- splash skip must run before paint
        setPhase("done");
      }
    } catch {
      /* storage unavailable */
    }
    setSplashGateReady(true);
  }, []);

  useEffect(() => {
    if (!splashGateReady || phase !== "loading") return;

    const durationMs = 5000 + Math.random() * 5000;
    const start = Date.now();

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const t = Math.min(1, elapsed / durationMs);
      const p = Math.round(t * 1000) / 10;
      setProgress(p);

      if (t >= 1) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setProgress(100);
        try {
          localStorage.setItem(SPLASH_SEEN_KEY, "1");
        } catch {
          /* storage unavailable */
        }
        setPhase("exiting");
      }
    }, 50);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [splashGateReady, phase]);

  const finishExit = useCallback(() => {
    setPhase("done");
  }, []);

  useEffect(() => {
    if (phase !== "exiting") return;
    const id = window.setTimeout(finishExit, 480);
    return () => clearTimeout(id);
  }, [phase, finishExit]);

  const showOverlay = splashGateReady && phase !== "done";
  const appReady = phase !== "loading";

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col">
      <div
        className={`min-h-0 flex-1 transition-opacity duration-500 ease-out ${
          appReady ? "opacity-100" : "pointer-events-none opacity-0 select-none"
        }`}
        aria-hidden={!appReady}
      >
        {children}
      </div>

      {showOverlay && (
        <div
          className={`fixed inset-0 z-200 flex flex-col items-center justify-center gap-8 bg-[#6a6e72] bg-[radial-gradient(ellipse_90%_70%_at_50%_45%,#9ea2a6_0%,#7c8084_42%,#5c6064_100%)] px-6 text-white transition-opacity duration-500 ease-out ${
            phase === "exiting" ? "opacity-0" : "opacity-100"
          }`}
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Loading Pulse Grid"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.04)_0%,transparent_45%,rgba(0,0,0,0.18)_100%)]"
          />

          <div className="relative z-10 flex max-w-lg flex-col items-center text-center">
            <p className="font-(family-name:--font-display) text-[10px] font-semibold uppercase tracking-[0.35em] text-white/55">
              Aim trainer
            </p>
            <h1 className="font-(family-name:--font-display) mt-2 text-3xl font-semibold uppercase tracking-[0.28em] text-white/95 sm:text-4xl">
              Pulse Grid
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-white/70 sm:text-base">
              Radial targets spawn from the center and drift outward in waves.
              Click or tap each square before it reaches the edge—train speed,
              precision, and tracking in one minimal arena.
            </p>
          </div>

          <div className="relative z-10 w-full max-w-sm">
            <div className="mb-3 flex items-end justify-between gap-4 text-[10px] uppercase tracking-[0.2em] text-white/45">
              <span>Loading</span>
              <span className="font-(family-name:--font-display) text-2xl tabular-nums text-white/90 sm:text-3xl">
                {progress.toFixed(1)}%
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/25 shadow-inner ring-1 ring-white/10">
              {/* No CSS width transition — it lagged behind the % and looked frozen */}
              <div
                className="h-full min-h-full rounded-full bg-linear-to-r from-fuchsia-500/90 via-purple-400 to-violet-400 shadow-[0_0_20px_rgba(168,85,247,0.45)]"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <p className="relative z-10 max-w-xs text-center text-[10px] text-white/40">
            Preparing audio, layout, and playfield…
          </p>
        </div>
      )}
    </div>
  );
}
