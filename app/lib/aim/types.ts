export type AimMode = "standard" | "precision" | "speed" | "tracking" | "flick";

export type AimDifficulty = "casual" | "standard" | "hard";

export type ColorTheme = "default" | "cyan" | "amber";

export type SessionGoal = "none" | "hits50" | "accuracy85";

export type GameParams = {
  mode: AimMode;
  waveDurationMs: number;
  minTargets: number;
  maxTargets: number;
  waveSpeedStep: number;
  waveSpeedCap: number;
  /** Multiplier on outward base speed at spawn */
  outwardSpeedScale: number;
  /** Visual / hitbox size scale */
  sizeScale: number;
  /** Max |rad/s| for tracking orbit */
  trackingAngleVel: number;
};
