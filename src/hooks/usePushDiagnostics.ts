import { useCallback, useEffect, useState } from 'react';

import {
  getPushPermissionStatusAsync,
  resolvePushProjectId,
} from '@/services/notificationService';
import {
  getPushDiagnosticEvents,
  getPushDiagnosticState,
} from '@/services/pushDiagnostics';
import { getStoredExpoPushToken } from '@/storage/pushTokenStorage';
import type { PushDiagnosticEvent, PushDiagnosticState } from '@/types/pushDiagnostics';

export function usePushDiagnostics(refreshIntervalMs = 5000) {
  const [events, setEvents] = useState<PushDiagnosticEvent[]>([]);
  const [state, setState] = useState<PushDiagnosticState | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<string>('—');
  const [storedTokenPrefix, setStoredTokenPrefix] = useState<string | null>(null);
  const [projectIdOk, setProjectIdOk] = useState(false);

  const refresh = useCallback(async () => {
    const [ev, st, perm, stored] = await Promise.all([
      getPushDiagnosticEvents(50),
      getPushDiagnosticState(),
      getPushPermissionStatusAsync(),
      getStoredExpoPushToken(),
    ]);

    setEvents(ev);
    setState(st);
    setPermissionStatus(perm);
    setProjectIdOk(Boolean(resolvePushProjectId()));
    if (stored?.trim()) {
      const trimmed = stored.trim();
      setStoredTokenPrefix(trimmed.length > 28 ? `${trimmed.slice(0, 28)}…` : trimmed);
    } else {
      setStoredTokenPrefix(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), refreshIntervalMs);
    return () => clearInterval(id);
  }, [refresh, refreshIntervalMs]);

  return {
    events,
    state,
    permissionStatus,
    storedTokenPrefix,
    projectIdOk,
    refresh,
  };
}

export function formatPushDiagTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString();
}
