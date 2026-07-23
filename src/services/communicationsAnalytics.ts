/**
 * Analytics internos del Communications Center / Inbox.
 * Centralizado para sustituir por proveedor externo en el futuro.
 * No envía datos fuera del dispositivo.
 */

export type CommunicationsEvent =
  | 'notification_received'
  | 'notification_opened'
  | 'notification_read'
  | 'notification_archived'
  | 'notification_navigation'
  | 'notification_preferences_changed'
  | 'notification_read_all'
  | 'notification_inbox_opened';

type AnalyticsPayload = Record<string, unknown>;

type AnalyticsSink = (event: CommunicationsEvent, payload?: AnalyticsPayload) => void;

const sinks: AnalyticsSink[] = [];

function sanitize(payload?: AnalyticsPayload): AnalyticsPayload | undefined {
  if (!payload) return undefined;
  const next: AnalyticsPayload = {};
  for (const [key, value] of Object.entries(payload)) {
    const lower = key.toLowerCase();
    if (
      lower.includes('token') ||
      lower.includes('jwt') ||
      lower.includes('authorization') ||
      lower.includes('password')
    ) {
      continue;
    }
    next[key] = value;
  }
  return next;
}

export function registerCommunicationsAnalyticsSink(sink: AnalyticsSink): () => void {
  sinks.push(sink);
  return () => {
    const idx = sinks.indexOf(sink);
    if (idx >= 0) sinks.splice(idx, 1);
  };
}

export function trackCommunicationsEvent(
  event: CommunicationsEvent,
  payload?: AnalyticsPayload,
): void {
  const safe = sanitize(payload) ?? {};
  if (__DEV__) {
    console.log(`[communications-analytics] ${event}`, safe);
  }
  for (const sink of sinks) {
    try {
      sink(event, safe);
    } catch {
      // sink failures must never break UX
    }
  }
}
