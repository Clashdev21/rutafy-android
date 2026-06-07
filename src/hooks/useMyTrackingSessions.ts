import { useCallback, useEffect, useState } from 'react';

import { fetchMyTrackingSessions } from '@/services/trackingSessionService';
import type { TrackingSessionDetail } from '@/types/tracking';
import { getApiErrorMessage } from '@/utils/errors';

export function useMyTrackingSessions() {
  const [sessions, setSessions] = useState<TrackingSessionDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const list = await fetchMyTrackingSessions();
      list.sort((a, b) => {
        const aTime = new Date(a.started_at ?? 0).getTime();
        const bTime = new Date(b.started_at ?? 0).getTime();
        return bTime - aTime;
      });
      setSessions(list);
      setError(null);
    } catch (e) {
      setError(getApiErrorMessage(e, 'No se pudo cargar el historial de capturas'));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { sessions, loading, error, refresh };
}
