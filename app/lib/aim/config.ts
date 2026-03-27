import type { AimDifficulty, AimMode, GameParams } from "./types";

const DIFF: Record<AimDifficulty, number> = {
  casual: 0.85,
  standard: 1,
  hard: 1.2,
};

export function getGameParams(
  mode: AimMode,
  difficulty: AimDifficulty
): GameParams {
  const d = DIFF[difficulty];

  const base: GameParams = {
    mode,
    waveDurationMs: 5000,
    minTargets: 3,
    maxTargets: 10,
    waveSpeedStep: 1.12,
    waveSpeedCap: 5.5,
    outwardSpeedScale: d,
    sizeScale: 1,
    trackingAngleVel: 0,
  };

  switch (mode) {
    case "precision":
      return {
        ...base,
        waveDurationMs: 6200,
        minTargets: 3,
        maxTargets: 9,
        waveSpeedStep: 1.07,
        waveSpeedCap: 4.8,
        outwardSpeedScale: 0.62 * d,
        sizeScale: 0.86,
        trackingAngleVel: 0,
      };
    case "speed":
      return {
        ...base,
        waveDurationMs: 3200,
        minTargets: 4,
        maxTargets: 12,
        waveSpeedStep: 1.16,
        waveSpeedCap: 6,
        outwardSpeedScale: 1.28 * d,
        sizeScale: 1,
        trackingAngleVel: 0,
      };
    case "tracking":
      return {
        ...base,
        waveDurationMs: 5000,
        outwardSpeedScale: 0.92 * d,
        sizeScale: 1,
        trackingAngleVel: 0.72 * d,
      };
    case "flick":
      return {
        ...base,
        waveDurationMs: 0,
        minTargets: 1,
        maxTargets: 1,
        waveSpeedStep: 1.14,
        waveSpeedCap: 6.5,
        outwardSpeedScale: 1.15 * d,
        sizeScale: 1.02,
        trackingAngleVel: 0,
      };
    default:
      return base;
  }
}

/** Need this many attempts in a run before we save a new “best accuracy”. */
export const MIN_ATTEMPTS_BEST_ACC = 30;

/** 100.0% only counts as best if the flawless streak is at least this long (avoids locking 100% after a short lucky run). */
export const MIN_ATTEMPTS_PERFECT_BEST = 50;

export function storageKeys(mode: AimMode, difficulty: AimDifficulty) {
  const id = `${mode}-${difficulty}`;
  return {
    bestScore: `aim-v1-best-score-${id}`,
    /** Stored as 0–1000 (tenths of a percent). */
    bestAcc: `aim-v2-best-acc-${id}`,
    /** Legacy 0–100 integer %; read once to migrate into `bestAcc`. */
    bestAccLegacy: `aim-v1-best-acc-${id}`,
  };
}
