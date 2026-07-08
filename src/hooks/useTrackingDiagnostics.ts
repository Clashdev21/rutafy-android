import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  isOperatorTrackingStartedAsync,
} from '@/services/operatorTrackingService';
import {
  analyzeTrackingDiagnostics,
  buildTrackingDiagnosticExport,
  formatDiagnosticGap,
  getTrackingDiagnosticEvents,
  getTrackingSnapshot,
  getTrackingStatistics,
  getSessionEndReason,
} from '@/services/trackingDiagnostics';
import { trackingSessionStorage } from '@/storage/trackingSessionStorage';
import type {
  TrackingDiagnosticAnalysis,
  TrackingDiagnosticEvent,
  TrackingSnapshot,
  TrackingStatistics,
  TrackingSessionEndReason,
} from '@/types/trackingDiagnostics';

export function useTrackingDiagnostics(refreshIntervalMs = 5000) {
  const [events, setEvents] = useState<TrackingDiagnosticEvent[]>([]);
  const [snapshot, setSnapshot] = useState<TrackingSnapshot>({});
  const [statistics, setStatistics] = useState<TrackingStatistics | null>(null);
  const [endReason, setEndReason] = useState<TrackingSessionEndReason | null>(null);
  const [fgServiceStarted, setFgServiceStarted] = useState(false);
  const [taskManagerStarted, setTaskManagerStarted] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(async () => {
    const [ev, snap, stats, reason, fgStarted, local] = await Promise.all([
      getTrackingDiagnosticEvents(100),
      getTrackingSnapshot(),
      getTrackingStatistics(),
      getSessionEndReason(),
      isOperatorTrackingStartedAsync(),
      trackingSessionStorage.getActive(),
    ]);

    setEvents(ev);
    setSnapshot(snap);
    setStatistics(stats);
    setEndReason(reason);
    setFgServiceStarted(fgStarted);
    setTaskManagerStarted(snap.taskManagerStarted ?? fgStarted);
    setSessionActive(Boolean(local?.sessionId));
    setLoading(false);
    setTick((n) => n + 1);
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), refreshIntervalMs);
    return () => clearInterval(id);
  }, [refresh, refreshIntervalMs]);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const analysis: TrackingDiagnosticAnalysis | null = useMemo(() => {
    if (!statistics) return null;
    void tick;
    return analyzeTrackingDiagnostics({
      events,
      snapshot,
      statistics,
      sessionActive,
      fgServiceStarted,
      taskManagerStarted,
    });
  }, [events, snapshot, statistics, sessionActive, fgServiceStarted, taskManagerStarted, tick]);

  const exportDiagnostic = useCallback(async () => {
    return buildTrackingDiagnosticExport();
  }, []);

  return {
    events,
    snapshot,
    statistics,
    endReason,
    sessionActive,
    fgServiceStarted,
    taskManagerStarted,
    analysis,
    loading,
    refresh,
    exportDiagnostic,
    formatGap: formatDiagnosticGap,
  };
}
