import type { TrackingDiagnosticEvent } from '@/types/trackingDiagnostics';

export type OpsTimelineEntry = {
  time: string;
  title: string;
  lines: string[];
  severity: 'normal' | 'warning' | 'critical';
};

function formatClock(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleTimeString();
}

function channelLabel(detail?: Record<string, unknown>): string | null {
  const ch = detail?.channel;
  if (ch === 'foreground') return 'Foreground';
  if (ch === 'background') return 'Background';
  const appState = detail?.appState;
  if (appState === 'foreground') return 'Foreground';
  if (appState === 'background') return 'Background';
  return null;
}

function formatSpeedMps(speed: unknown): string | null {
  if (typeof speed !== 'number' || !Number.isFinite(speed)) return null;
  const kmh = Math.round(speed * 3.6);
  return `${kmh} km/h`;
}

function formatAccuracy(acc: unknown): string | null {
  if (typeof acc !== 'number' || !Number.isFinite(acc)) return null;
  return `accuracy ${Math.round(acc)} m`;
}

export function formatDiagnosticEventForOps(
  event: TrackingDiagnosticEvent,
): OpsTimelineEntry {
  const d = event.detail ?? {};
  const time = formatClock(event.timestamp);
  const channel = channelLabel(d);

  switch (event.type) {
    case 'gps-fix-received':
      return {
        time,
        title: 'GPS FIX',
        lines: [
          channel ?? 'GPS',
          formatAccuracy(d.accuracy) ?? formatAccuracy(d.accuracy_m),
          formatSpeedMps(d.speed) ?? formatSpeedMps(d.speed_mps),
        ].filter((x): x is string => Boolean(x)),
        severity: 'normal',
      };

    case 'point-mapped':
      return {
        time,
        title: 'POINT MAPPED',
        lines: [channel ?? 'Mapper', formatAccuracy(d.accuracy)].filter(
          (x): x is string => Boolean(x),
        ),
        severity: 'normal',
      };

    case 'point-buffered':
      return {
        time,
        title: 'POINT BUFFERED',
        lines: [
          channel ?? 'Buffer',
          typeof d.bufferSize === 'number' ? `${d.bufferSize} en cola` : null,
        ].filter((x): x is string => Boolean(x)),
        severity: 'normal',
      };

    case 'batch-created':
      return {
        time,
        title: 'BATCH CREATED',
        lines: [
          typeof d.pointCount === 'number' ? `${d.pointCount} punto(s)` : null,
          channel,
        ].filter((x): x is string => Boolean(x)),
        severity: 'normal',
      };

    case 'batch-send':
      return {
        time,
        title: 'BATCH SEND',
        lines: [
          typeof d.pointCount === 'number' ? `${d.pointCount} punto(s)` : null,
          channel,
        ].filter((x): x is string => Boolean(x)),
        severity: 'normal',
      };

    case 'batch-success':
      return {
        time,
        title: 'BATCH SUCCESS',
        lines: [
          typeof d.pointCount === 'number' ? `${d.pointCount} punto(s)` : 'Batch OK',
          typeof d.latencyMs === 'number' ? `latency ${d.latencyMs} ms` : null,
          channel,
        ].filter((x): x is string => Boolean(x)),
        severity: 'normal',
      };

    case 'batch-accepted':
      return {
        time,
        title: 'BATCH ACCEPTED',
        lines: [
          typeof d.accepted === 'number' ? `${d.accepted} aceptado(s)` : null,
          typeof d.latencyMs === 'number' ? `latency ${d.latencyMs} ms` : null,
        ].filter((x): x is string => Boolean(x)),
        severity: 'normal',
      };

    case 'batch-error':
    case 'batch-401':
    case 'batch-403':
    case 'batch-500':
    case 'batch-timeout':
      return {
        time,
        title: event.type.replace('batch-', 'BATCH ').toUpperCase(),
        lines: [
          typeof d.status === 'number' ? `HTTP ${d.status}` : null,
          typeof d.error === 'string' ? d.error : null,
          typeof d.latencyMs === 'number' ? `latency ${d.latencyMs} ms` : null,
        ].filter((x): x is string => Boolean(x)),
        severity: 'critical',
      };

    case 'tracking-stale':
      return {
        time,
        title: 'TRACKING STALE',
        lines: [
          d.reason === 'gps_gap'
            ? `Sin GPS durante ${String(d.gapSeconds ?? '?')} segundos`
            : d.reason === 'buffer_gap'
              ? `Sin buffer durante ${String(d.gapSeconds ?? '?')} segundos`
              : d.reason === 'batch_gap'
                ? `Sin batch durante ${String(d.gapSeconds ?? '?')} segundos`
                : d.reason === 'batch_accept_gap'
                  ? `Batch sin aceptar durante ${String(d.gapSeconds ?? '?')} segundos`
                  : `Stale: ${String(d.reason ?? 'unknown')}`,
        ],
        severity: 'warning',
      };

    case 'bg-task-start':
      return {
        time,
        title: 'BG TASK START',
        lines: ['Foreground Service / location updates iniciados'],
        severity: 'normal',
      };

    case 'bg-task-stop':
      return {
        time,
        title: 'BG TASK STOP',
        lines: ['Location updates detenidos'],
        severity: 'warning',
      };

    case 'bg-task-killed':
      return {
        time,
        title: 'BG TASK KILLED',
        lines: ['TaskManager ya no tiene location updates activos'],
        severity: 'critical',
      };

    case 'bg-task-restored':
      return {
        time,
        title: 'BG TASK RESTORED',
        lines: ['Location updates reanudados'],
        severity: 'normal',
      };

    case 'tracking-start':
      return {
        time,
        title: 'TRACKING START',
        lines: ['Captura logística iniciada'],
        severity: 'normal',
      };

    case 'tracking-restored':
      return {
        time,
        title: 'TRACKING RESTORED',
        lines: ['Sesión restaurada desde storage'],
        severity: 'normal',
      };

    case 'tracking-stop':
      return {
        time,
        title: 'TRACKING STOP',
        lines: ['Captura finalizada por usuario'],
        severity: 'normal',
      };

    case 'tracking-cancel':
      return {
        time,
        title: 'TRACKING CANCEL',
        lines: ['Captura cancelada por usuario'],
        severity: 'normal',
      };

    case 'tracking-cleanup':
      return {
        time,
        title: 'TRACKING CLEANUP',
        lines: [typeof d.reason === 'string' ? `Motivo: ${d.reason}` : 'Limpieza local'],
        severity: 'warning',
      };

    case 'refresh-start':
      return { time, title: 'REFRESH START', lines: ['Renovando access token'], severity: 'normal' };

    case 'refresh-success':
      return { time, title: 'REFRESH OK', lines: ['Token renovado'], severity: 'normal' };

    case 'refresh-failed':
      return {
        time,
        title: 'REFRESH FAILED',
        lines: [typeof d.reason === 'string' ? d.reason : 'Fallo de refresh'],
        severity: 'critical',
      };

    case 'app-foreground':
      return { time, title: 'APP FOREGROUND', lines: ['App en primer plano'], severity: 'normal' };

    case 'app-background':
      return { time, title: 'APP BACKGROUND', lines: ['App en segundo plano'], severity: 'normal' };

    case 'app-inactive':
      return { time, title: 'APP INACTIVE', lines: [], severity: 'normal' };

    case 'app-active':
      return { time, title: 'APP ACTIVE', lines: [], severity: 'normal' };

    case 'app-destroyed':
      return { time, title: 'APP DESTROYED', lines: ['Componente desmontado'], severity: 'warning' };

    default:
      return {
        time,
        title: event.type.toUpperCase().replace(/-/g, ' '),
        lines: [],
        severity: 'normal',
      };
  }
}

export function formatGapLive(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  if (seconds < 60) return `${seconds} s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m} m ${s} s` : `${m} m`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} m`;
}
