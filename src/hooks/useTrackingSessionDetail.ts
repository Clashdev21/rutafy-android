import { useCallback, useEffect, useState } from 'react';

import { fetchTrackingSessionDetail } from '@/services/trackingSessionService';
import type { TrackingSessionDetail } from '@/types/tracking';
import { getApiErrorMessage } from '@/utils/errors';

export function useTrackingSessionDetail(sessionId: string | null | undefined) {
  const [session, setSession] = useState<TrackingSessionDetail | null>(null);
  const [loading, setLoading] = useState(Boolean(sessionId?.trim()));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const id = sessionId?.trim();
    if (!id) {
      setSession(null);
      setLoading(false);
      setError('Sesión no especificada');
      return;
    }

    setLoading(true);
    try {
      const detail = await fetchTrackingSessionDetail(id);
      if (!detail) {
        setSession(null);
        setError('No se encontró la sesión de captura');
        return;
      }
      setSession(detail);
      setError(null);
    } catch (e) {
      setSession(null);
      setError(getApiErrorMessage(e, 'No se pudo cargar el resumen de la sesión'));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { session, loading, error, refresh };
}
