"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

type GamePhase = "idle" | "playing";

type Target = {
  id: string;
  angle: number;
  /** Distance from playfield center along ray (px); size grows with this — tunnel “toward you” */
  dist: number;
  /** Base outward speed at spawn (px/s) */
  baseSpeed: number;
};

/** Max distance from center (cx,cy) to field edge along ray direction */
function maxRayDistFromCenter(w: number, h: number, angle: number): number {
  const cx = w / 2;
  const cy = h / 2;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  let t = Infinity;
  if (ux > 1e-9) t = Math.min(t, (w - cx) / ux);
  if (ux < -1e-9) t = Math.min(t, (0 - cx) / ux);
  if (uy > 1e-9) t = Math.min(t, (h - cy) / uy);
  if (uy < -1e-9) t = Math.min(t, (0 - cy) / uy);
  return Number.isFinite(t) ? Math.max(0, t) : 0;
}

/**
 * Tunnel perspective: small near center, then grows to a **fixed max** and stays there
 * (not infinitely large — size plateaus while position still moves outward).
 */
function targetSizePx(
  dist: number,
  w: number,
  h: number,
  angle: number,
  minDim: number
): number {
  const D = maxRayDistFromCenter(w, h, angle);
  const minS = minDim * 0.028;
  /** Absolute cap — fraction of playfield; never exceeds this */
  const maxS = minDim * 0.13;
  if (D < 1e-6) return minS;
  /** Reach max size by ~half the ray; after that, size stays flat */
  const dReachMax = D * 0.48;
  const u = Math.min(1, dist / Math.max(1e-6, dReachMax));
  const eased = u * u * (3 - 2 * u);
  return minS + (maxS - minS) * eased;
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function targetFitsPlayfield(
  dist: number,
  w: number,
  h: number,
  angle: number,
  minDim: number
): boolean {
  const size = targetSizePx(dist, w, h, angle, minDim);
  const half = size / 2;
  const cx = w / 2 + Math.cos(angle) * dist;
  const cy = h / 2 + Math.sin(angle) * dist;
  return (
    cx - half >= 0 &&
    cx + half <= w &&
    cy - half >= 0 &&
    cy + half <= h
  );
}

/** Furthest distance along the ray where the squircle still fits (axis-aligned bounds). */
function maxSafeDistAlongRay(
  w: number,
  h: number,
  angle: number,
  minDim: number
): number {
  const ray = maxRayDistFromCenter(w, h, angle);
  if (ray < 1e-6) return 0;
  if (!targetFitsPlayfield(0, w, h, angle, minDim)) return 0;
  let lo = 0;
  let hi = ray;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (targetFitsPlayfield(mid, w, h, angle, minDim)) lo = mid;
    else hi = mid;
  }
  return lo;
}

const WAVE_DURATION_MS = 5000;
const MIN_TARGETS_PER_WAVE = 3;
const MAX_TARGETS_PER_WAVE = 10;
const WAVE_SPEED_STEP = 1.12;

/** Shorter comet trail (time window + max samples) */
const TRAIL_MAX_MS = 220;
const TRAIL_MAX_POINTS = 20;

function randomIntInclusive(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export default function AimTrainer() {
  const areaRef = useRef<HTMLDivElement>(null);
  const targetsRef = useRef<Target[]>([]);
  const spawnCountRef = useRef(0);
  const rafRef = useRef<number>(0);
  const startedAtRef = useRef(0);
  const lastFrameRef = useRef(0);

  /** Absolute timestamps for when each target in the current wave should appear */
  const waveScheduleRef = useRef<number[]>([]);
  const waveSpawnIdxRef = useRef(0);
  const waveNumRef = useRef(0);
  const waveSpeedMultRef = useRef(1);

  const [phase, setPhase] = useState<GamePhase>("idle");
  const [tick, setTick] = useState(0);
  const [score, setScore] = useState(0);
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [waveLabel, setWaveLabel] = useState(0);
  const [nextWaveCount, setNextWaveCount] = useState(0);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [trailVersion, setTrailVersion] = useState(0);
  const [trailSnapshot, setTrailSnapshot] = useState<
    Array<{ x: number; y: number }>
  >([]);
  const pointerTrailRef = useRef<Array<{ x: number; y: number; t: number }>>([]);
  const trailRafRef = useRef(0);

  const scheduleTrailRedraw = useCallback(() => {
    if (trailRafRef.current) return;
    trailRafRef.current = requestAnimationFrame(() => {
      trailRafRef.current = 0;
      setTrailVersion((v) => (v + 1) & 0xfffffff);
    });
  }, []);

  const forceRender = useCallback(
    () => setTick((t) => (t + 1) & 0xfffffff),
    []
  );

  const beginWave = useCallback((now: number) => {
    const n = randomIntInclusive(MIN_TARGETS_PER_WAVE, MAX_TARGETS_PER_WAVE);
    waveSpawnIdxRef.current = 0;
    const schedule: number[] = [];
    for (let i = 0; i < n; i++) {
      const offset =
        n <= 1 ? 0 : (i / (n - 1)) * WAVE_DURATION_MS;
      schedule.push(now + offset);
    }
    waveScheduleRef.current = schedule;
    setNextWaveCount(n);

    if (waveNumRef.current > 0) {
      waveSpeedMultRef.current = Math.min(
        waveSpeedMultRef.current * WAVE_SPEED_STEP,
        5.5
      );
    }
    waveNumRef.current += 1;
    setWaveLabel(waveNumRef.current);
  }, []);

  const spawnSingleTarget = useCallback((w: number, h: number) => {
    const minDim = Math.min(w, h);
    const angle = Math.random() * Math.PI * 2;
    const safeLimit = maxSafeDistAlongRay(w, h, angle, minDim) * 0.94;
    const dist = Math.min(
      randomBetween(minDim * 0.03, minDim * 0.07),
      safeLimit * 0.42
    );
    const mult = waveSpeedMultRef.current;
    const baseSpeed = randomBetween(72, 105) * mult;

    targetsRef.current.push({
      id: crypto.randomUUID(),
      angle,
      dist,
      baseSpeed,
    });
    spawnCountRef.current += 1;
  }, []);

  const resetGame = useCallback(() => {
    targetsRef.current = [];
    spawnCountRef.current = 0;
    waveScheduleRef.current = [];
    waveSpawnIdxRef.current = 0;
    waveNumRef.current = 0;
    waveSpeedMultRef.current = 1;
    setScore(0);
    setHits(0);
    setMisses(0);
    setElapsedMs(0);
    setWaveLabel(0);
    setNextWaveCount(0);
  }, []);

  const startGame = useCallback(() => {
    resetGame();
    const el = areaRef.current;
    if (!el) return;
    const { width: w, height: h } = el.getBoundingClientRect();
    if (w < 32 || h < 32) return;

    const now = performance.now();
    startedAtRef.current = now;
    lastFrameRef.current = now;
    beginWave(now);
    setPhase("playing");
    forceRender();
  }, [resetGame, beginWave, forceRender]);

  const trailBlurId = useId().replace(/:/g, "");

  useEffect(() => {
    setTrailSnapshot(
      pointerTrailRef.current.map((p) => ({ x: p.x, y: p.y }))
    );
  }, [trailVersion]);

  /** Fade trail when idle / not playing */
  useEffect(() => {
    if (phase !== "playing") {
      pointerTrailRef.current = [];
      setTrailVersion((v) => v + 1);
      return;
    }
    let id = 0;
    const loop = () => {
      const now = performance.now();
      const arr = pointerTrailRef.current;
      let changed = false;
      while (arr.length > 0 && now - arr[0].t > TRAIL_MAX_MS) {
        arr.shift();
        changed = true;
      }
      if (changed) setTrailVersion((v) => (v + 1) & 0xfffffff);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [phase]);

  const handleHit = useCallback(
    (id: string) => {
      if (phase !== "playing") return;
      const active = targetsRef.current.length;
      targetsRef.current = targetsRef.current.filter((t) => t.id !== id);
      const gained = Math.max(120, Math.floor(520 + active * 40));
      setHits((h) => h + 1);
      setScore((s) => {
        const next = s + gained;
        setBestScore((b) => Math.max(b, next));
        return next;
      });
      forceRender();
    },
    [phase, forceRender]
  );

  useEffect(() => {
    if (phase !== "playing") return;

    const loop = (now: number) => {
      const el = areaRef.current;
      if (!el) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      const { width: w, height: h } = el.getBoundingClientRect();
      if (w < 8 || h < 8) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      const elapsedSec = (now - startedAtRef.current) / 1000;
      const dt = Math.min((now - lastFrameRef.current) / 1000, 0.064);
      lastFrameRef.current = now;

      const runSpawns = () => {
        const sch = waveScheduleRef.current;
        while (
          waveSpawnIdxRef.current < sch.length &&
          now >= sch[waveSpawnIdxRef.current]
        ) {
          spawnSingleTarget(w, h);
          waveSpawnIdxRef.current += 1;
        }
      };

      runSpawns();

      const list = targetsRef.current;
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        t.dist += t.baseSpeed * dt;
      }

      const minDim = Math.min(w, h);
      const beforeEscape = targetsRef.current.length;
      targetsRef.current = targetsRef.current.filter((t) =>
        targetFitsPlayfield(t.dist, w, h, t.angle, minDim)
      );
      const escaped = beforeEscape - targetsRef.current.length;
      if (escaped > 0) {
        setMisses((m) => m + escaped);
      }

      const sch = waveScheduleRef.current;
      const allSpawned = waveSpawnIdxRef.current >= sch.length;
      const waveCleared =
        allSpawned && sch.length > 0 && targetsRef.current.length === 0;
      if (waveCleared) {
        beginWave(now);
        runSpawns();
      }

      setElapsedMs(Math.floor(elapsedSec * 1000));
      forceRender();
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, spawnSingleTarget, beginWave, forceRender]);

  const area = areaRef.current;
  const w = area?.getBoundingClientRect().width ?? 1;
  const h = area?.getBoundingClientRect().height ?? 1;
  const minDim = Math.min(w, h);
  const targets = [...targetsRef.current].sort((a, b) => a.dist - b.dist);

  const spawned = spawnCountRef.current;
  const attempts = hits + misses;
  const accuracyPct =
    attempts > 0 ? Math.min(100, Math.round((hits / attempts) * 100)) : 100;
  const displayAccuracy = phase === "idle" ? 100 : accuracyPct;

  const rank =
    score >= 500000
      ? "S"
      : score >= 200000
        ? "A"
        : score >= 80000
          ? "B"
          : score >= 20000
            ? "C"
            : "—";

  const progress = Math.min(1, elapsedMs / 120000);

  void trailVersion;
  const trailPointsStr = trailSnapshot
    .map((p) => `${p.x},${p.y}`)
    .join(" ");

  return (
    <div className="relative flex h-dvh max-h-dvh min-h-0 w-full select-none flex-col overflow-hidden overscroll-none bg-[#7c8084] bg-[radial-gradient(ellipse_90%_70%_at_50%_45%,#9ea2a6_0%,#7c8084_42%,#6a6e72_100%)] px-3 py-3 text-white sm:px-4 sm:py-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.03)_0%,transparent_40%,rgba(0,0,0,0.2)_100%)]"
      />

      <header className="relative z-10 mb-2 flex w-full max-w-3xl shrink-0 flex-col gap-1.5 self-center px-1 sm:mb-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold uppercase tracking-[0.35em] text-white/95 drop-shadow-[0_0_24px_rgba(255,255,255,0.15)] sm:text-3xl">
              Pulse Grid
            </h1>
            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-white/55">
              Each wave: random targets over 5s — clear all to start the next (faster)
            </p>
          </div>
          {bestScore > 0 && (
            <div className="text-right text-[10px] uppercase tracking-widest text-white/40">
              Best{" "}
              <span className="font-[family-name:var(--font-display)] text-lg text-white/80">
                {bestScore.toLocaleString()}
              </span>
            </div>
          )}
        </div>

        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08] shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-white/50 via-white to-white/70 shadow-[0_0_12px_rgba(255,255,255,0.35)] transition-[width] duration-300 ease-out"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] uppercase tracking-[0.2em] text-white/35">
          <span>Session</span>
          <span>
            {String(Math.floor(elapsedMs / 60000)).padStart(2, "0")}:
            {String(Math.floor((elapsedMs % 60000) / 1000)).padStart(2, "0")}
          </span>
        </div>
      </header>

      <div className="relative z-10 flex min-h-0 w-full max-w-3xl flex-1 flex-col items-center justify-center gap-2 self-center">
        <div
          ref={areaRef}
          className={`relative aspect-square w-full max-h-[min(52dvh,85vw,520px)] min-h-0 shrink rounded-sm ${phase === "playing" ? "cursor-none" : ""}`}
          onMouseMove={(e) => {
            const r = areaRef.current?.getBoundingClientRect();
            if (!r) return;
            const x = e.clientX - r.left;
            const y = e.clientY - r.top;
            setPointer({ x, y });
            const now = performance.now();
            const arr = pointerTrailRef.current;
            const last = arr[arr.length - 1];
            if (
              !last ||
              (x - last.x) ** 2 + (y - last.y) ** 2 > 3
            ) {
              arr.push({ x, y, t: now });
            }
            while (arr.length > 0 && now - arr[0].t > TRAIL_MAX_MS) arr.shift();
            while (arr.length > TRAIL_MAX_POINTS) arr.shift();
            scheduleTrailRedraw();
          }}
          onMouseLeave={() => {
            setPointer(null);
            pointerTrailRef.current = [];
            scheduleTrailRedraw();
          }}
        >
          {/* Faint background score — tunnel depth cue */}
          {phase === "playing" && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-0 flex select-none items-center justify-center font-[family-name:var(--font-display)] text-[clamp(4rem,28vmin,11rem)] font-bold tabular-nums leading-none text-white/[0.07]"
            >
              {score > 0 ? String(score).slice(0, 6) : "0"}
            </div>
          )}

          {phase === "playing" && trailSnapshot.length >= 2 && (
            <svg
              aria-hidden
              className="pointer-events-none absolute inset-0 z-[2] h-full w-full overflow-visible"
              width={w}
              height={h}
              viewBox={`0 0 ${w} ${h}`}
              preserveAspectRatio="none"
            >
              <defs>
                <filter
                  id={`trail-soft-${trailBlurId}`}
                  x="-50%"
                  y="-50%"
                  width="200%"
                  height="200%"
                >
                  <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
                </filter>
              </defs>
              <polyline
                points={trailPointsStr}
                fill="none"
                stroke="rgba(255,255,255,0.18)"
                strokeWidth={12}
                strokeLinecap="round"
                strokeLinejoin="round"
                filter={`url(#trail-soft-${trailBlurId})`}
              />
              <polyline
                points={trailPointsStr}
                fill="none"
                stroke="rgba(255,255,255,0.42)"
                strokeWidth={4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}

          {/* Corner brackets (above trail) */}
          <div className="pointer-events-none absolute inset-0 z-[6]">
            <span className="absolute left-0 top-0 block h-8 w-8 border-l-2 border-t-2 border-white shadow-[0_0_12px_rgba(255,255,255,0.35)]" />
            <span className="absolute right-0 top-0 block h-8 w-8 border-r-2 border-t-2 border-white shadow-[0_0_12px_rgba(255,255,255,0.35)]" />
            <span className="absolute bottom-0 left-0 block h-8 w-8 border-b-2 border-l-2 border-white shadow-[0_0_12px_rgba(255,255,255,0.35)]" />
            <span className="absolute bottom-0 right-0 block h-8 w-8 border-b-2 border-r-2 border-white shadow-[0_0_12px_rgba(255,255,255,0.35)]" />
          </div>

          {/* Targets: draw order small → large so “closer” targets stack on top */}
          {phase === "playing" &&
            targets.map((t) => {
              const size = targetSizePx(t.dist, w, h, t.angle, minDim);
              const cx = w / 2 + Math.cos(t.angle) * t.dist;
              const cy = h / 2 + Math.sin(t.angle) * t.dist;
              return (
                <button
                  key={t.id}
                  type="button"
                  className="absolute z-10 rounded-2xl border-2 border-white bg-transparent shadow-[0_0_14px_rgba(255,255,255,0.35)] outline-none hover:brightness-110 active:brightness-125"
                  style={{
                    left: cx - size / 2,
                    top: cy - size / 2,
                    width: size,
                    height: size,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleHit(t.id);
                  }}
                />
              );
            })}

          {phase === "playing" && pointer && (
            <div
              aria-hidden
              className="pointer-events-none absolute z-30 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/50 bg-white shadow-[0_0_14px_rgba(255,255,255,1),0_0_28px_rgba(255,255,255,0.45),0_8px_20px_rgba(0,0,0,0.2)]"
              style={{ left: pointer.x, top: pointer.y }}
            />
          )}

          {/* Center idle / overlay */}
          {phase !== "playing" && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/35 backdrop-blur-[2px]">
              <div className="flex max-w-sm flex-col items-center gap-5 px-6 text-center">
                <p className="font-[family-name:var(--font-display)] text-xl uppercase tracking-[0.25em] text-white/90">
                  Ready
                </p>
                <button
                  type="button"
                  onClick={startGame}
                  className="group relative overflow-hidden rounded-full border border-white/25 bg-white/10 px-10 py-3 font-[family-name:var(--font-display)] text-sm font-semibold uppercase tracking-[0.3em] text-white shadow-[0_0_24px_rgba(255,255,255,0.12)] transition hover:bg-white/18"
                >
                  <span className="relative z-10">Start</span>
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 transition group-hover:opacity-100" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* HUD: left column = rank + run info, right column = scoring */}
        <div className="pointer-events-none mt-1 grid w-full shrink-0 grid-cols-2 gap-x-4 gap-y-1 px-0.5 text-[10px] uppercase tracking-[0.16em] sm:gap-x-10 sm:text-[11px] sm:tracking-[0.18em]">
          <div className="flex min-w-0 flex-col items-start gap-2">
            <span
              className="font-[family-name:var(--font-display)] text-4xl font-bold leading-none tabular-nums sm:text-5xl"
              style={{
                color: "rgb(168 85 247)",
                textShadow: "0 0 32px rgba(168,85,247,0.45)",
              }}
            >
              {phase === "playing" ? rank : "—"}
            </span>
            <span className="text-white/50">
              Accuracy{" "}
              <span className="font-[family-name:var(--font-display)] text-base text-white/85 sm:text-lg">
                {displayAccuracy}%
              </span>
            </span>
            <div className="mt-1 flex w-full flex-col gap-1.5 border-t border-white/10 pt-2">
              {[
                ["Wave", phase === "playing" ? String(waveLabel) : "—"],
                ["Batch", phase === "playing" ? String(nextWaveCount) : "—"],
              ].map(([label, val]) => (
                <div
                  key={label}
                  className="flex w-full max-w-[11rem] justify-between gap-3"
                >
                  <span className="text-white/40">{label}</span>
                  <span className="font-[family-name:var(--font-display)] tabular-nums text-white/90">
                    {val}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex min-w-0 flex-col items-end gap-1.5 text-right">
            {[
              ["Score", score.toLocaleString()],
              ["Hits", String(hits)],
              ["Misses", String(misses)],
              ["Notes", `${hits}/${spawned}`],
            ].map(([label, val]) => (
              <div
                key={label}
                className="flex w-full max-w-[14rem] justify-end gap-4 sm:gap-6"
              >
                <span className="text-white/40">{label}</span>
                <span className="font-[family-name:var(--font-display)] min-w-[3ch] tabular-nums text-base text-white/90">
                  {val}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Re-render driver for RAF positions */}
      <span className="sr-only" aria-hidden>
        {tick}
      </span>
    </div>
  );
}
