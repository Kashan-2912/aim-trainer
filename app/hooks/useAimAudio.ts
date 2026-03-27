"use client";

import { useCallback, useEffect, useRef } from "react";

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) return null;
  return new Ctx();
}

export function useAimAudio(volume: number, muted: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);

  const ensureCtx = useCallback(() => {
    if (!ctxRef.current) ctxRef.current = getAudioContext();
    const ctx = ctxRef.current;
    if (ctx?.state === "suspended") void ctx.resume();
    return ctx;
  }, []);

  useEffect(() => {
    return () => {
      void ctxRef.current?.close();
      ctxRef.current = null;
    };
  }, []);

  const beep = useCallback(
    (freq: number, dur: number, type: OscillatorType = "sine") => {
      if (muted) return;
      const ctx = ensureCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const v = Math.max(0, Math.min(1, volume)) * 0.22;
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(v, ctx.currentTime + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + dur + 0.02);
    },
    [ensureCtx, muted, volume]
  );

  const playHit = useCallback(() => beep(920, 0.045, "sine"), [beep]);
  const playMiss = useCallback(() => beep(180, 0.1, "triangle"), [beep]);
  const playWave = useCallback(() => beep(660, 0.07, "sine"), [beep]);
  const playTick = useCallback(() => beep(440, 0.02, "sine"), [beep]);

  return { playHit, playMiss, playWave, playTick };
}
