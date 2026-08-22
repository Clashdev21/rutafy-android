/**
 * Speed 2B.1 — tipos de clasificación experimental (solo diagnóstico).
 */

export type MotionActivityLevel = 'low' | 'medium' | 'high';

export type MotionActivityClassification = {
  /** null si métricas inválidas — no contar como low/medium/high. */
  activityLevel: MotionActivityLevel | null;
  reason: string;
  rmsG: number | null;
  p95G: number | null;
  peakG: number | null;
};

export type MotionTimelineBucket = {
  bucketStartedAt: string;
  bucketEndedAt: string;
  windowCount: number;
  lowWindows: number;
  mediumWindows: number;
  highWindows: number;
  avgDynamicAccelRmsG: number | null;
  maxDynamicAccelRmsG: number | null;
  maxPeakDynamicAccelG: number | null;
  dominantActivityLevel: MotionActivityLevel | null;
  /** ms de cobertura FG atribuibles a ventanas de este bucket (aprox). */
  foregroundCoverageMs: number;
};

export type SessionMotionTimeline = {
  sessionId: string;
  buckets: MotionTimelineBucket[];
};
