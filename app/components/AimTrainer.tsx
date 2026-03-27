"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import SessionSummary from "@/app/components/aim/SessionSummary";
import {
  getGameParams,
  MIN_ATTEMPTS_BEST_ACC,
  MIN_ATTEMPTS_PERFECT_BEST,
  storageKeys,
} from "@/app/lib/aim/config";
import {
  accuracyHitsToTenths,
  escapeQuadrant,
  formatAccuracyTenths,
  maxSafeDistAlongRay,
  randomBetween,
  randomIntInclusive,
  targetFitsPlayfield,
  targetSizePx,
} from "@/app/lib/aim/geometry";
import type {
  AimDifficulty,
  AimMode,
  ColorTheme,
  GameParams,
  SessionGoal,
} from "@/app/lib/aim/types";
import { useAimAudio } from "@/app/hooks/useAimAudio";

type GamePhase = "idle" | "playing";

type Target = {
  id: string;
  angle: number;
  dist: number;
  baseSpeed: number;
  angleVel?: number;
};

type SessionEvt = { t: number; type: "hit" | "miss"; q?: number };

const HEADER_TAGLINE =
  "Sharpen your reflexes and precision with sleek, lightning-fast aim trainer built for pure performance.";

function targetBorderClass(theme: ColorTheme, highContrast: boolean) {
  const t =
    theme === "cyan"
      ? "border-cyan-400 shadow-[0_0_16px_rgba(34,211,238,0.45)]"
      : theme === "amber"
        ? "border-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.45)]"
        : "border-white shadow-[0_0_14px_rgba(255,255,255,0.35)]";
  return `absolute z-10 rounded-2xl border-2 bg-transparent outline-none hover:brightness-110 active:brightness-125 touch-manipulation ${t} ${highContrast ? "ring-2 ring-white" : ""}`;
}

export default function AimTrainer() {
  const areaRef = useRef<HTMLDivElement>(null);
  const fsRef = useRef<HTMLDivElement>(null);
  const targetsRef = useRef<Target[]>([]);
  const spawnCountRef = useRef(0);
  const rafRef = useRef<number>(0);
  const startedAtRef = useRef(0);
  const lastFrameRef = useRef(0);

  const waveScheduleRef = useRef<number[]>([]);
  const waveSpawnIdxRef = useRef(0);
  const waveNumRef = useRef(0);
  const waveSpeedMultRef = useRef(1);

  const gameParamsRef = useRef<GameParams>(getGameParams("standard", "standard"));
  const rngRef = useRef<() => number>(Math.random);
  const isPausedRef = useRef(false);
  const sessionEventsRef = useRef<SessionEvt[]>([]);
  const quadMissRef = useRef<[number, number, number, number]>([0, 0, 0, 0]);
  const acc85MsRef = useRef(0);

  const [playfieldSize, setPlayfieldSize] = useState({ w: 1, h: 1 });
  const [acc85MsUi, setAcc85MsUi] = useState(0);

  const [phase, setPhase] = useState<GamePhase>("idle");
  const [paused, setPaused] = useState(false);
  const [tick, setTick] = useState(0);
  const [score, setScore] = useState(0);
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [bestAccStored, setBestAccStored] = useState(0);
  const [waveLabel, setWaveLabel] = useState(0);
  const [nextWaveCount, setNextWaveCount] = useState(0);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [trailVersion, setTrailVersion] = useState(0);
  const [trailSnapshot, setTrailSnapshot] = useState<
    Array<{ x: number; y: number }>
  >([]);
  const pointerTrailRef = useRef<Array<{ x: number; y: number; t: number }>>([]);
  const trailRafRef = useRef(0);

  const [mode, setMode] = useState<AimMode>("standard");
  const [difficulty, setDifficulty] = useState<AimDifficulty>("standard");
  const [colorTheme, setColorTheme] = useState<ColorTheme>("default");
  const [highContrast, setHighContrast] = useState(false);
  const [goal, setGoal] = useState<SessionGoal>("none");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryStats, setSummaryStats] = useState<{
    wHits: number;
    wMiss: number;
    wAcc: number;
    quad: [number, number, number, number];
  } | null>(null);
  const [missFlash, setMissFlash] = useState(false);
  const [volume, setVolume] = useState(0.75);
  const [muted, setMuted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const { playHit, playMiss, playWave, playTick } = useAimAudio(volume, muted);

  const TRAIL_MAX_MS = reducedMotion ? 0 : 220;
  const TRAIL_MAX_POINTS = reducedMotion ? 0 : 20;

  const trailBlurId = useId().replace(/:/g, "");

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const fn = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  useEffect(() => {
    isPausedRef.current = paused;
    if (!paused) lastFrameRef.current = performance.now();
  }, [paused]);

  const loadBests = useCallback(() => {
    try {
      const k = storageKeys(mode, difficulty);
      const bs = localStorage.getItem(k.bestScore);
      if (bs) setBestScore(parseInt(bs, 10) || 0);

      let accTenths = 0;
      const v2 = localStorage.getItem(k.bestAcc);
      if (v2) {
        accTenths = Math.min(1000, parseInt(v2, 10) || 0);
      } else {
        const legacy = localStorage.getItem(k.bestAccLegacy);
        if (legacy) {
          const n = Math.min(100, parseInt(legacy, 10) || 0);
          accTenths = Math.min(1000, n * 10);
        }
      }
      setBestAccStored(accTenths);
    } catch {
      /* ignore */
    }
  }, [mode, difficulty]);

  useEffect(() => {
    loadBests();
  }, [loadBests]);

  const persistScore = useCallback(
    (next: number) => {
      try {
        const k = storageKeys(mode, difficulty);
        const prev = parseInt(localStorage.getItem(k.bestScore) || "0", 10);
        if (next > prev) {
          localStorage.setItem(k.bestScore, String(next));
          setBestScore(next);
        }
      } catch {
        /* ignore */
      }
    },
    [mode, difficulty]
  );

  const persistAcc = useCallback(
    (accTenths: number) => {
      try {
        const k = storageKeys(mode, difficulty);
        const prev = parseInt(localStorage.getItem(k.bestAcc) || "0", 10);
        const next = Math.min(1000, Math.max(0, Math.floor(accTenths)));
        if (next > prev) {
          localStorage.setItem(k.bestAcc, String(next));
          setBestAccStored(next);
        }
      } catch {
        /* ignore */
      }
    },
    [mode, difficulty]
  );

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
    const p = gameParamsRef.current;
    const rng = rngRef.current;
    const n = randomIntInclusive(p.minTargets, p.maxTargets, rng);
    waveSpawnIdxRef.current = 0;
    const schedule: number[] = [];
    const dur = p.waveDurationMs <= 0 ? 0 : p.waveDurationMs;
    for (let i = 0; i < n; i++) {
      const offset = n <= 1 ? 0 : (i / (n - 1)) * dur;
      schedule.push(now + offset);
    }
    waveScheduleRef.current = schedule;
    setNextWaveCount(n);

    if (waveNumRef.current > 0) {
      waveSpeedMultRef.current = Math.min(
        waveSpeedMultRef.current * p.waveSpeedStep,
        p.waveSpeedCap
      );
    }
    waveNumRef.current += 1;
    setWaveLabel(waveNumRef.current);
  }, []);

  const spawnSingleTarget = useCallback((w: number, h: number) => {
    const p = gameParamsRef.current;
    const rng = rngRef.current;
    const minDim = Math.min(w, h);
    const coarse =
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: coarse)").matches;
    const sizeScale = p.sizeScale * (coarse ? 1.1 : 1);
    const angle = rng() * Math.PI * 2;
    const safeLimit = maxSafeDistAlongRay(w, h, angle, minDim, sizeScale) * 0.94;
    if (safeLimit < minDim * 0.02) return;

    const dist = Math.min(
      randomBetween(minDim * 0.03, minDim * 0.07, rng),
      safeLimit * 0.42
    );
    const mult = waveSpeedMultRef.current;
    const baseSpeed =
      randomBetween(72, 105, rng) * mult * p.outwardSpeedScale;

    targetsRef.current.push({
      id: crypto.randomUUID(),
      angle,
      dist,
      baseSpeed,
      angleVel:
        p.trackingAngleVel > 0
          ? randomBetween(-p.trackingAngleVel, p.trackingAngleVel, rng)
          : undefined,
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
    sessionEventsRef.current = [];
    quadMissRef.current = [0, 0, 0, 0];
    acc85MsRef.current = 0;
    setAcc85MsUi(0);
    setScore(0);
    setHits(0);
    setMisses(0);
    setElapsedMs(0);
    setWaveLabel(0);
    setNextWaveCount(0);
  }, []);

  const startGame = useCallback(() => {
    resetGame();
    gameParamsRef.current = getGameParams(mode, difficulty);
    rngRef.current = Math.random;
    const el = areaRef.current;
    if (!el) return;
    const { width: w, height: h } = el.getBoundingClientRect();
    if (w < 32 || h < 32) return;

    const now = performance.now();
    startedAtRef.current = now;
    lastFrameRef.current = now;
    beginWave(now);
    setPaused(false);
    isPausedRef.current = false;
    setPhase("playing");
    playTick();
    forceRender();
  }, [resetGame, beginWave, forceRender, mode, difficulty, playTick]);

  const endSession = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setPaused(false);
    isPausedRef.current = false;
    resetGame();
    pointerTrailRef.current = [];
    setPointer(null);
    setTrailVersion((v) => v + 1);
    setPhase("idle");
  }, [resetGame]);

  useEffect(() => {
    setTrailSnapshot(
      pointerTrailRef.current.map((p) => ({ x: p.x, y: p.y }))
    );
  }, [trailVersion]);

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
  }, [phase, TRAIL_MAX_MS]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== "playing") return;
      if (e.code === "Space" || e.code === "Escape") {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  useEffect(() => {
    if (goal !== "accuracy85" || phase !== "playing" || paused) return;
    const id = window.setInterval(() => {
      const att = hits + misses;
      if (att < 12) {
        acc85MsRef.current = 0;
        setAcc85MsUi(0);
        return;
      }
      if (hits / att >= 0.85) acc85MsRef.current += 1000;
      else acc85MsRef.current = 0;
      setAcc85MsUi(acc85MsRef.current);
      forceRender();
    }, 1000);
    return () => clearInterval(id);
  }, [goal, phase, paused, hits, misses, forceRender]);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const sync = () => {
      const r = el.getBoundingClientRect();
      setPlayfieldSize({ w: r.width, h: r.height });
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [phase]);

  useEffect(() => {
    if (!summaryOpen) return;
    const now = performance.now();
    const ev = sessionEventsRef.current.filter((e) => now - e.t < 60_000);
    const wh = ev.filter((e) => e.type === "hit").length;
    const wm = ev.filter((e) => e.type === "miss").length;
    const wa =
      wh + wm > 0 ? accuracyHitsToTenths(wh, wh + wm) : 0;
    setSummaryStats({
      wHits: wh,
      wMiss: wm,
      wAcc: wa,
      quad: [...quadMissRef.current],
    });
  }, [summaryOpen]);

  useEffect(() => {
    if (phase !== "playing") return;
    const att = hits + misses;
    if (att < MIN_ATTEMPTS_BEST_ACC) return;
    const tenths = accuracyHitsToTenths(hits, att);
    if (tenths === 1000 && att < MIN_ATTEMPTS_PERFECT_BEST) return;
    persistAcc(tenths);
  }, [phase, hits, misses, persistAcc]);

  const handleHit = useCallback(
    (idStr: string) => {
      if (phase !== "playing" || isPausedRef.current) return;
      const active = targetsRef.current.length;
      targetsRef.current = targetsRef.current.filter((t) => t.id !== idStr);
      const gained = Math.max(120, Math.floor(520 + active * 40));
      setHits((h) => h + 1);
      setScore((s) => {
        const next = s + gained;
        persistScore(next);
        return next;
      });
      sessionEventsRef.current.push({ t: performance.now(), type: "hit" });
      playHit();
      forceRender();
    },
    [phase, forceRender, persistScore, playHit]
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

      if (isPausedRef.current) {
        lastFrameRef.current = now;
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      const elapsedSec = (now - startedAtRef.current) / 1000;
      const dt = Math.min((now - lastFrameRef.current) / 1000, 0.064);
      lastFrameRef.current = now;

      const p = gameParamsRef.current;
      const sizeScale =
        p.sizeScale *
        (typeof window !== "undefined" &&
        window.matchMedia("(pointer: coarse)").matches
          ? 1.1
          : 1);
      const minDim = Math.min(w, h);

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
        if (t.angleVel) t.angle += t.angleVel * dt;
        t.dist += t.baseSpeed * dt;
      }

      const surviving: Target[] = [];
      for (const t of targetsRef.current) {
        if (targetFitsPlayfield(t.dist, w, h, t.angle, minDim, sizeScale)) {
          surviving.push(t);
        } else {
          const cx = w / 2 + Math.cos(t.angle) * t.dist;
          const cy = h / 2 + Math.sin(t.angle) * t.dist;
          const q = escapeQuadrant(cx, cy, w, h);
          const qd = [...quadMissRef.current] as [number, number, number, number];
          qd[q] += 1;
          quadMissRef.current = qd;
          sessionEventsRef.current.push({ t: performance.now(), type: "miss", q });
          setMissFlash(true);
          window.setTimeout(() => setMissFlash(false), 90);
          playMiss();
        }
      }
      const escaped = targetsRef.current.length - surviving.length;
      targetsRef.current = surviving;
      if (escaped > 0) setMisses((m) => m + escaped);

      const sch = waveScheduleRef.current;
      const allSpawned = waveSpawnIdxRef.current >= sch.length;
      const waveCleared =
        allSpawned && sch.length > 0 && targetsRef.current.length === 0;
      if (waveCleared) {
        beginWave(now);
        playWave();
        runSpawns();
      }

      setElapsedMs(Math.floor(elapsedSec * 1000));
      forceRender();
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, spawnSingleTarget, beginWave, forceRender, playMiss, playWave]);

  const rw = playfieldSize.w;
  const rh = playfieldSize.h;
  const p = getGameParams(mode, difficulty);
  const coarse =
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches;
  const sizeScale = p.sizeScale * (coarse ? 1.1 : 1);
  const minDim = Math.min(rw, rh);
  /* eslint-disable react-hooks/refs -- RAF updates refs; tick-driven render reads snapshot */
  const targets = [...targetsRef.current].sort((a, b) => a.dist - b.dist);
  const spawned = spawnCountRef.current;
  /* eslint-enable react-hooks/refs */
  const attempts = hits + misses;
  const accuracyTenths =
    attempts > 0 ? accuracyHitsToTenths(hits, attempts) : 0;
  const displayAccuracyStr =
    phase === "idle" || attempts === 0
      ? "—"
      : formatAccuracyTenths(accuracyTenths);

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

  const goalHitsProg = goal === "hits50" ? Math.min(100, (hits / 50) * 100) : 0;
  const goalAccProg =
    goal === "accuracy85"
      ? Math.min(100, (acc85MsUi / 120_000) * 100)
      : 0;

  const goFullscreen = () => {
    const el = fsRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen().catch(() => {});
  };

  return (
    <div className="relative flex h-dvh max-h-dvh min-h-0 w-full select-none flex-col overflow-hidden overscroll-none bg-[#7c8084] bg-[radial-gradient(ellipse_90%_70%_at_50%_45%,#9ea2a6_0%,#7c8084_42%,#6a6e72_100%)] px-3 py-2 text-white sm:px-4 sm:py-3">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.03)_0%,transparent_40%,rgba(0,0,0,0.2)_100%)]"
      />

      <SessionSummary
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        windowHits={summaryStats?.wHits ?? 0}
        windowMisses={summaryStats?.wMiss ?? 0}
        windowAcc={summaryStats?.wAcc ?? 0}
        quad={summaryStats?.quad ?? [0, 0, 0, 0]}
        sessionHits={hits}
        sessionMisses={misses}
        sessionAcc={accuracyTenths}
      />

      <header className="relative z-10 flex w-full max-w-4xl shrink-0 flex-col gap-1 self-center px-1">
        <div className="flex min-w-0 flex-nowrap items-start justify-between gap-3">
          <h1 className="shrink-0 font-(family-name:--font-display) text-xl font-semibold uppercase tracking-[0.3em] text-white/95 sm:text-2xl">
            Pulse Grid
          </h1>
          <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
            {phase === "playing" && (
              <button
                type="button"
                onClick={endSession}
                className="shrink-0 rounded-lg border-2 border-red-500 bg-transparent px-3 py-1.5 font-(family-name:--font-display) text-[10px] font-semibold uppercase tracking-[0.25em] text-red-500 shadow-[0_0_12px_rgba(239,68,68,0.25)] outline-none transition hover:bg-red-500/10 active:bg-red-500/15 sm:px-4 sm:text-[11px]"
              >
                End
              </button>
            )}
            {(bestScore > 0 || bestAccStored > 0) && (
              <div className="text-right text-[9px] uppercase tracking-widest text-white/40">
                {bestScore > 0 && (
                  <span className="mr-3">
                    Best score{" "}
                    <span className="font-(family-name:--font-display) text-sm text-white/85">
                      {bestScore.toLocaleString()}
                    </span>
                  </span>
                )}
                {bestAccStored > 0 && (
                  <span>
                    Best acc{" "}
                    <span className="font-(family-name:--font-display) text-sm text-white/85">
                      {formatAccuracyTenths(bestAccStored)}
                    </span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <p className="max-w-none text-[11px] font-normal leading-snug text-white/65 sm:text-[12px] sm:leading-relaxed">
          {HEADER_TAGLINE}
        </p>
        <p className="max-w-xl text-[10px] uppercase tracking-[0.18em] text-white/45">
          Modes · pause Space · summary · audio
        </p>

        {phase === "idle" && (
          <div className="mt-2 flex flex-wrap items-end gap-2.5 rounded-lg border border-white/10 bg-black/15 p-2.5 text-xs uppercase tracking-widest sm:text-[13px]">
            <label className="flex flex-col gap-0.5 text-white/50">
              Mode
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as AimMode)}
                className="rounded border border-white/20 bg-zinc-900 px-2.5 py-1.5 text-sm text-white"
              >
                <option value="standard">Standard</option>
                <option value="precision">Precision</option>
                <option value="speed">Speed</option>
                <option value="tracking">Tracking</option>
                <option value="flick">Flick</option>
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-white/50">
              Difficulty
              <select
                value={difficulty}
                onChange={(e) =>
                  setDifficulty(e.target.value as AimDifficulty)
                }
                className="rounded border border-white/20 bg-zinc-900 px-2.5 py-1.5 text-sm text-white"
              >
                <option value="casual">Casual</option>
                <option value="standard">Standard</option>
                <option value="hard">Hard</option>
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-white/50">
              Target color
              <select
                value={colorTheme}
                onChange={(e) => setColorTheme(e.target.value as ColorTheme)}
                className="rounded border border-white/20 bg-zinc-900 px-2.5 py-1.5 text-sm text-white"
              >
                <option value="default">White</option>
                <option value="cyan">Cyan</option>
                <option value="amber">Amber</option>
              </select>
            </label>
            <label className="flex items-center gap-2 pt-4 text-sm text-white/60">
              <input
                type="checkbox"
                checked={highContrast}
                onChange={(e) => setHighContrast(e.target.checked)}
              />
              High contrast
            </label>
            <label className="flex flex-col gap-0.5 text-white/50">
              Goal
              <select
                value={goal}
                onChange={(e) => setGoal(e.target.value as SessionGoal)}
                className="rounded border border-white/20 bg-zinc-900 px-2.5 py-1.5 text-sm text-white"
              >
                <option value="none">None</option>
                <option value="hits50">50 hits</option>
                <option value="accuracy85">85% × 2 min</option>
              </select>
            </label>
          </div>
        )}

        {phase === "playing" && (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest">
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-white/90 hover:bg-white/15"
            >
              {paused ? "Resume" : "Pause"}
            </button>
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              className="rounded-full border border-white/25 bg-white/10 px-3 py-1"
            >
              {muted ? "Unmute" : "Mute"}
            </button>
            <label className="flex items-center gap-1 text-white/50">
              Vol
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-20"
              />
            </label>
            <button
              type="button"
              onClick={() => setSummaryOpen(true)}
              className="rounded-full border border-white/25 bg-white/10 px-3 py-1"
            >
              Summary
            </button>
            <button
              type="button"
              onClick={goFullscreen}
              className="rounded-full border border-white/25 bg-white/10 px-3 py-1"
            >
              Fullscreen
            </button>
          </div>
        )}

        <div className="relative mt-1 h-1 w-full overflow-hidden rounded-full bg-white/8">
          <div
            className="h-full rounded-full bg-linear-to-r from-white/50 via-white to-white/70"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-[9px] uppercase tracking-[0.2em] text-white/35">
          <span>Session</span>
          <span>
            {String(Math.floor(elapsedMs / 60000)).padStart(2, "0")}:
            {String(Math.floor((elapsedMs % 60000) / 1000)).padStart(2, "0")}
          </span>
        </div>
      </header>

      {goal !== "none" && phase === "playing" && (
        <div className="mx-auto mt-1 w-full max-w-4xl px-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-black/25">
            <div
              className="h-full rounded-full bg-fuchsia-500/90 transition-[width]"
              style={{
                width: `${goal === "hits50" ? goalHitsProg : goalAccProg}%`,
              }}
            />
          </div>
          <p className="mt-0.5 text-[9px] uppercase tracking-widest text-white/45">
            {goal === "hits50" && `Goal: 50 hits — ${hits}/50`}
            {goal === "accuracy85" &&
              `Goal: hold ≥85% (15+ tries) — ${Math.floor(acc85MsUi / 1000)}s / 120s`}
          </p>
        </div>
      )}

      <div
        ref={fsRef}
        className="relative z-10 flex min-h-0 w-full max-w-4xl flex-1 flex-col items-center justify-center gap-1 self-center overflow-hidden"
      >
        <div
          ref={areaRef}
          className={`relative mx-auto aspect-square w-[min(100%,min(76vw,calc(min(100svh,100dvh)-20rem),440px))] max-w-full shrink-0 touch-none rounded-sm ${phase === "playing" ? "cursor-none" : ""} ${highContrast ? "ring-2 ring-white/30" : ""}`}
          onMouseMove={(e) => {
            if (TRAIL_MAX_POINTS <= 0) {
              const r = areaRef.current?.getBoundingClientRect();
              if (!r) return;
              setPointer({
                x: e.clientX - r.left,
                y: e.clientY - r.top,
              });
              return;
            }
            const r = areaRef.current?.getBoundingClientRect();
            if (!r) return;
            const x = e.clientX - r.left;
            const y = e.clientY - r.top;
            setPointer({ x, y });
            const now = performance.now();
            const arr = pointerTrailRef.current;
            const last = arr[arr.length - 1];
            if (!last || (x - last.x) ** 2 + (y - last.y) ** 2 > 3) {
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
          onTouchMove={(e) => {
            if (phase !== "playing") return;
            e.preventDefault();
            const r = areaRef.current?.getBoundingClientRect();
            const t = e.touches[0];
            if (!r || !t) return;
            const x = t.clientX - r.left;
            const y = t.clientY - r.top;
            setPointer({ x, y });
            if (TRAIL_MAX_POINTS <= 0) return;
            const now = performance.now();
            const arr = pointerTrailRef.current;
            const last = arr[arr.length - 1];
            if (!last || (x - last.x) ** 2 + (y - last.y) ** 2 > 3) {
              arr.push({ x, y, t: now });
            }
            while (arr.length > 0 && now - arr[0].t > TRAIL_MAX_MS) arr.shift();
            while (arr.length > TRAIL_MAX_POINTS) arr.shift();
            scheduleTrailRedraw();
          }}
        >
          {missFlash && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-25 animate-pulse rounded-sm ring-4 ring-red-400/50"
            />
          )}

          {phase === "playing" && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-0 flex select-none items-center justify-center font-(family-name:--font-display) text-[clamp(3rem,22vmin,9rem)] font-bold tabular-nums leading-none text-white/[0.07]"
            >
              {score > 0 ? String(score).slice(0, 6) : "0"}
            </div>
          )}

          {phase === "playing" &&
            TRAIL_MAX_POINTS >= 2 &&
            trailSnapshot.length >= 2 && (
              <svg
                aria-hidden
                className="pointer-events-none absolute inset-0 z-2 h-full w-full overflow-visible"
                width={rw}
                height={rh}
                viewBox={`0 0 ${rw} ${rh}`}
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

          <div className="pointer-events-none absolute inset-0 z-6">
            <span className="absolute left-0 top-0 block h-8 w-8 border-l-2 border-t-2 border-white shadow-[0_0_12px_rgba(255,255,255,0.35)]" />
            <span className="absolute right-0 top-0 block h-8 w-8 border-r-2 border-t-2 border-white shadow-[0_0_12px_rgba(255,255,255,0.35)]" />
            <span className="absolute bottom-0 left-0 block h-8 w-8 border-b-2 border-l-2 border-white shadow-[0_0_12px_rgba(255,255,255,0.35)]" />
            <span className="absolute bottom-0 right-0 block h-8 w-8 border-b-2 border-r-2 border-white shadow-[0_0_12px_rgba(255,255,255,0.35)]" />
          </div>

          {phase === "playing" &&
            targets.map((t) => {
              const size = targetSizePx(
                t.dist,
                rw,
                rh,
                t.angle,
                minDim,
                sizeScale
              );
              const cx = rw / 2 + Math.cos(t.angle) * t.dist;
              const cy = rh / 2 + Math.sin(t.angle) * t.dist;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={targetBorderClass(colorTheme, highContrast)}
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
              className="pointer-events-none absolute z-30 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/50 bg-white shadow-[0_0_14px_rgba(255,255,255,1)]"
              style={{ left: pointer.x, top: pointer.y }}
            />
          )}

          {phase !== "playing" && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/35 backdrop-blur-[2px]">
              <div className="flex max-w-sm flex-col items-center gap-4 px-6 text-center">
                <p className="font-(family-name:--font-display) text-lg uppercase tracking-[0.25em] text-white/90">
                  Ready
                </p>
                <button
                  type="button"
                  onClick={startGame}
                  className="rounded-full border border-white/25 bg-white/10 px-10 py-3 font-(family-name:--font-display) text-xs font-semibold uppercase tracking-[0.3em] text-white hover:bg-white/18"
                >
                  Start
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="pointer-events-none mt-1 grid w-full shrink-0 grid-cols-2 gap-x-4 gap-y-1 px-0.5 text-[10px] uppercase tracking-[0.16em] sm:gap-x-10 sm:text-[11px]">
          <div className="flex min-w-0 flex-col items-start gap-1.5">
            <span
              className="font-(family-name:--font-display) text-3xl font-bold leading-none tabular-nums sm:text-4xl"
              style={{
                color: "rgb(168 85 247)",
                textShadow: "0 0 32px rgba(168,85,247,0.45)",
              }}
            >
              {phase === "playing" ? rank : "—"}
            </span>
            <span className="text-white/50">
              Accuracy{" "}
              <span className="font-(family-name:--font-display) text-base text-white/85">
                {displayAccuracyStr}
              </span>
            </span>
            <div className="mt-1 flex w-full flex-col gap-1 border-t border-white/10 pt-1.5">
              {[
                ["Wave", phase === "playing" ? String(waveLabel) : "—"],
                ["Batch", phase === "playing" ? String(nextWaveCount) : "—"],
              ].map(([label, val]) => (
                <div
                  key={label}
                  className="flex w-full max-w-44 justify-between gap-2"
                >
                  <span className="text-white/40">{label}</span>
                  <span className="font-(family-name:--font-display) tabular-nums text-white/90">
                    {val}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex min-w-0 flex-col items-end gap-1 text-right">
            {[
              ["Score", score.toLocaleString()],
              ["Hits", String(hits)],
              ["Misses", String(misses)],
              ["Notes", `${hits}/${spawned}`],
            ].map(([label, val]) => (
              <div
                key={label}
                className="flex w-full max-w-56 justify-end gap-3"
              >
                <span className="text-white/40">{label}</span>
                <span className="font-(family-name:--font-display) min-w-[3ch] tabular-nums text-base text-white/90">
                  {val}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="relative z-10 shrink-0 py-1 text-center text-[10px] text-white/45 sm:text-[11px]">
        Made by{" "}
        <a
          href="https://itzkashan.dev/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/75 underline decoration-white/25 underline-offset-2 transition hover:text-white hover:decoration-white/50"
        >
          Kashan
        </a>
      </p>

      <span className="sr-only" aria-hidden>
        {tick}
      </span>
    </div>
  );
}
