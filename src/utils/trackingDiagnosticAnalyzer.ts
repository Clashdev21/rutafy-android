import type {
  TrackingDiagnosticAnalysis,
  TrackingDiagnosticEvent,
  TrackingSnapshot,
  TrackingStatistics,
  PipelineStageStatus,
} from '@/types/trackingDiagnostics';

const STALE_SECONDS = 180;

const PIPELINE_STAGES = [
  { key: 'gps', label: 'GPS', events: ['gps-fix-received'] },
  { key: 'mapper', label: 'Mapper', events: ['point-mapped'] },
  { key: 'buffer', label: 'Buffer', events: ['point-buffered'] },
  { key: 'batch', label: 'Batch', events: ['batch-created', 'batch-send'] },
  { key: 'http', label: 'HTTP', events: ['batch-success', 'batch-error', 'batch-401', 'batch-403', 'batch-500', 'batch-timeout'] },
  { key: 'accepted', label: 'Accepted', events: ['batch-accepted'] },
  { key: 'heartbeat', label: 'Heartbeat', events: ['batch-success', 'batch-accepted', 'tracking-health-snapshot'] },
] as const;

const NOISE_EVENT_TYPES = new Set([
  'access-token-read',
  'tracking-storage-loaded',
  'session-end-reason',
]);

function gapSeconds(iso: string | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / 1000));
}

function findLastEvent(
  events: TrackingDiagnosticEvent[],
  types: string[],
): TrackingDiagnosticEvent | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (types.includes(events[i].type)) return events[i];
  }
  return null;
}

function findLastEventOfType(
  events: TrackingDiagnosticEvent[],
  type: string,
): TrackingDiagnosticEvent | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i].type === type) return events[i];
  }
  return null;
}

function buildPipelineSummary(
  events: TrackingDiagnosticEvent[],
  nowMs: number,
  sessionActive: boolean,
): PipelineStageStatus[] {
  return PIPELINE_STAGES.map((stage) => {
    const last = findLastEvent(events, [...stage.events]);
    const gap = gapSeconds(last?.timestamp, nowMs);
    const ok =
      !sessionActive ||
      gap == null ||
      (stage.key === 'buffer' && last == null) ||
      gap <= STALE_SECONDS;
    return {
      stage: stage.label,
      lastAt: last?.timestamp ?? null,
      lastEventType: last?.type ?? null,
      ok,
      gapSeconds: gap,
    };
  });
}

function buildBreakpointNarrative(
  analysis: Omit<TrackingDiagnosticAnalysis, 'breakpointNarrative'>,
  snapshot: TrackingSnapshot,
  events: TrackingDiagnosticEvent[],
): string[] {
  const lines: string[] = [];
  const lastGps = snapshot.lastGpsAt;
  const lastBatchOk = snapshot.lastBatchAcceptedAt ?? snapshot.lastBatchSentAt;
  const lastBuffer = snapshot.lastPointBufferedAt;

  if (lastGps) {
    lines.push(`Último GPS: ${formatClock(lastGps)}`);
  }

  if (lastBuffer && lastGps && new Date(lastBuffer) >= new Date(lastGps)) {
    lines.push('↓ Hubo point-buffered después del GPS');
  } else if (lastGps && !lastBuffer) {
    lines.push('↓ No hubo point-buffered (captura puede ser solo background)');
  }

  if (lastBatchOk) {
    lines.push(`Último batch OK: ${formatClock(lastBatchOk)}`);
  }

  if (analysis.missingAfter) {
    lines.push(`↓ Primer evento ausente: ${analysis.missingAfter}`);
  }

  if (analysis.failedComponent) {
    lines.push(`↓ Pipeline detenido en: ${analysis.failedComponent}`);
  }

  const lastStale = findLastEventOfType(events, 'tracking-stale');
  if (lastStale?.detail?.reason) {
    lines.push(
      `↓ tracking-stale (${String(lastStale.detail.reason)}, ${String(lastStale.detail.gapSeconds ?? '?')}s)`,
    );
  }

  const lastKilled = findLastEventOfType(events, 'bg-task-killed');
  if (lastKilled) {
    lines.push(`↓ bg-task-killed: ${formatClock(lastKilled.timestamp)}`);
  }

  return lines;
}

function formatClock(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleTimeString();
}

export function analyzeTrackingDiagnostics(input: {
  events: TrackingDiagnosticEvent[];
  snapshot: TrackingSnapshot;
  statistics: TrackingStatistics;
  sessionActive: boolean;
  fgServiceStarted: boolean;
  taskManagerStarted: boolean;
  nowMs?: number;
}): TrackingDiagnosticAnalysis {
  const nowMs = input.nowMs ?? Date.now();
  const events = input.events.filter((e) => !NOISE_EVENT_TYPES.has(e.type));
  const { snapshot, statistics, sessionActive, fgServiceStarted, taskManagerStarted } = input;

  const gpsGap = gapSeconds(snapshot.lastGpsAt, nowMs);
  const bufferGap = gapSeconds(snapshot.lastPointBufferedAt, nowMs);
  const batchGap = gapSeconds(snapshot.lastBatchSentAt, nowMs);
  const batchAcceptGap = gapSeconds(snapshot.lastBatchAcceptedAt, nowMs);
  const heartbeatGap = gapSeconds(snapshot.lastHeartbeatAt, nowMs);

  const lastOperational =
    events.length > 0 ? events[events.length - 1] : null;

  const lastBatchSuccess = findLastEventOfType(events, 'batch-success');
  const lastBatchSend = findLastEventOfType(events, 'batch-send');
  const lastGpsEvent = findLastEventOfType(events, 'gps-fix-received');
  const lastStale = findLastEventOfType(events, 'tracking-stale');
  const lastTaskKilled = findLastEventOfType(events, 'bg-task-killed');
  const lastBatchError = findLastEvent(events, [
    'batch-error',
    'batch-401',
    'batch-403',
    'batch-500',
    'batch-timeout',
  ]);
  const lastCleanup = findLastEventOfType(events, 'tracking-cleanup');

  const httpFailed =
    statistics.httpErrors > 0 &&
    lastBatchError != null &&
    (!lastBatchSuccess ||
      new Date(lastBatchError.timestamp) > new Date(lastBatchSuccess.timestamp));

  const gpsFailed = sessionActive && gpsGap != null && gpsGap > STALE_SECONDS;
  const batchFailed =
    sessionActive &&
    ((batchGap != null && batchGap > STALE_SECONDS) ||
      (batchAcceptGap != null &&
        batchAcceptGap > STALE_SECONDS &&
        batchGap != null &&
        batchGap <= STALE_SECONDS));

  const taskFailed =
    sessionActive &&
    (!taskManagerStarted ||
      (lastTaskKilled != null &&
        (!lastGpsEvent ||
          new Date(lastTaskKilled.timestamp) > new Date(lastGpsEvent.timestamp))));

  const batchIndicatorOk =
    !sessionActive ||
    (!batchFailed && !httpFailed && (batchAcceptGap == null || batchAcceptGap <= STALE_SECONDS));

  const indicators = {
    gps:
      !sessionActive
        ? ('unknown' as const)
        : gpsFailed
          ? ('red' as const)
          : ('green' as const),
    foregroundService:
      !sessionActive
        ? ('unknown' as const)
        : fgServiceStarted
          ? ('green' as const)
          : ('red' as const),
    taskManager:
      !sessionActive
        ? ('unknown' as const)
        : taskFailed
          ? ('red' as const)
          : ('green' as const),
    batch: !sessionActive ? ('unknown' as const) : batchIndicatorOk ? ('green' as const) : ('red' as const),
    http:
      !sessionActive
        ? ('unknown' as const)
        : httpFailed
          ? ('red' as const)
          : statistics.httpErrors > 0
            ? ('red' as const)
            : ('green' as const),
  };

  let failedComponent: TrackingDiagnosticAnalysis['failedComponent'] = null;
  let confidence: TrackingDiagnosticAnalysis['confidence'] = 'low';
  let probableCause = 'Sin evidencia de fallo; el pipeline parece operativo o la sesión no está activa.';
  let recommendation =
    'Continuar la captura. Si hay anomalía, exportar diagnóstico al finalizar la prueba.';
  let missingAfter: string | null = null;

  if (lastCleanup && (!lastOperational || new Date(lastCleanup.timestamp) >= new Date(lastOperational.timestamp))) {
    failedComponent = 'Storage';
    confidence = 'high';
    probableCause = 'La sesión local fue limpiada (tracking-cleanup).';
    recommendation = 'Revisar motivo de cleanup en timeline (end/cancel, session_not_active, ownership).';
    missingAfter = 'gps-fix-received';
  } else if (taskFailed && (lastTaskKilled || !taskManagerStarted)) {
    failedComponent = 'TaskManager';
    confidence = 'high';
    probableCause =
      'El TaskManager dejó de ejecutar location updates (bg-task-killed o hasStartedLocationUpdatesAsync=false).';
    recommendation =
      'Revisar Foreground Service, notificación persistente y restricciones de batería del dispositivo.';
    missingAfter = 'gps-fix-received';
  } else if (httpFailed || (lastBatchSend && !lastBatchSuccess && batchGap != null && batchGap > 60)) {
    failedComponent = 'HTTP';
    confidence = lastBatchError?.type === 'batch-401' ? 'high' : 'medium';
    if (lastBatchError?.type === 'batch-401') {
      probableCause = 'Los batches dejaron de ser aceptados (401 — token sin refresh en background).';
      recommendation = 'Correlacionar con refresh-start/success en timeline; sprint 1H+ para refresh BG.';
    } else if (lastBatchError?.type === 'batch-timeout') {
      probableCause = 'Timeout HTTP al enviar batch.';
      recommendation = 'Revisar conectividad de red en el momento del último batch-send.';
    } else {
      probableCause = 'Hubo batch-send sin batch-success posterior.';
      recommendation = 'Revisar errores HTTP en timeline (batch-error, 401, 403, 500).';
    }
    missingAfter = 'batch-success';
  } else if (
    batchFailed &&
    gpsGap != null &&
    gpsGap <= STALE_SECONDS &&
    bufferGap != null &&
    bufferGap > STALE_SECONDS
  ) {
    failedComponent = 'Buffer';
    confidence = 'medium';
    probableCause = 'Llegaron fixes GPS pero el buffer dejó de acumular puntos (foreground).';
    recommendation = 'Revisar si operatorBgActive bloquea el buffer o si la app estaba solo en background.';
    missingAfter = 'point-buffered';
  } else if (gpsFailed) {
    failedComponent = 'GPS';
    confidence = lastStale?.detail?.reason === 'gps_gap' ? 'high' : 'medium';
    probableCause = 'El sistema dejó de recibir posiciones del proveedor GPS / callback de ubicación.';
    recommendation = 'Revisar Foreground Service, TaskManager y proveedor GPS del dispositivo.';
    missingAfter = 'gps-fix-received';
  } else if (
    sessionActive &&
    lastBatchSuccess &&
    gpsGap != null &&
    gpsGap > STALE_SECONDS
  ) {
    failedComponent = 'GPS';
    confidence = 'high';
    probableCause = `Último batch-success a las ${formatClock(lastBatchSuccess.timestamp)}; después no hubo más gps-fix-received.`;
    recommendation = 'Revisar si Android suspendió location updates tras ~30 min.';
    missingAfter = 'gps-fix-received';
  }

  if (lastStale?.detail?.reason === 'batch_accept_gap' && !failedComponent) {
    failedComponent = 'HTTP';
    confidence = 'medium';
    probableCause = 'Batch enviado pero no aceptado (batch_accept_gap en tracking-stale).';
    recommendation = 'Revisar respuestas HTTP tras último batch-send.';
    missingAfter = 'batch-accepted';
  }

  let overallStatus: TrackingDiagnosticAnalysis['overallStatus'] = 'OPERANDO';
  if (!sessionActive && events.length === 0) {
    overallStatus = 'ATENCIÓN';
  } else if (
    failedComponent &&
    (confidence === 'high' || gpsGap != null && gpsGap > STALE_SECONDS)
  ) {
    overallStatus = 'CRÍTICO';
  } else if (
    sessionActive &&
    ((gpsGap != null && gpsGap > 60) ||
      (batchGap != null && batchGap > 60) ||
      (heartbeatGap != null && heartbeatGap > 60) ||
      indicators.http === 'red')
  ) {
    overallStatus = 'ATENCIÓN';
  }

  const pipelineSummary = buildPipelineSummary(events, nowMs, sessionActive);

  const partial: Omit<TrackingDiagnosticAnalysis, 'breakpointNarrative'> = {
    overallStatus,
    lastEvent: lastOperational
      ? { type: lastOperational.type, timestamp: lastOperational.timestamp }
      : null,
    missingAfter,
    failedComponent,
    confidence,
    probableCause,
    recommendation,
    pipelineSummary,
    indicators,
    gaps: {
      gpsSeconds: gpsGap,
      bufferSeconds: bufferGap,
      batchSeconds: batchGap,
      heartbeatSeconds: heartbeatGap,
      refreshSeconds: gapSeconds(snapshot.lastRefreshAt, nowMs),
    },
  };

  return {
    ...partial,
    breakpointNarrative: buildBreakpointNarrative(partial, snapshot, events),
  };
}
