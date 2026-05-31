import { useCallback, useMemo, useState } from 'react';

import { usePolling } from '@/hooks/usePolling';
import * as transportistaService from '@/services/transportistaService';
import type { Service } from '@/types/service';
import { getApiErrorMessage } from '@/utils/errors';
import { pickTransportistaActiveService } from '@/utils/serviceStatus';

const POLL_MS = 5000;

export function useTransportistaServices(requesterCompanyId: string | null) {
  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!requesterCompanyId) {
      setServices([]);
      setError('No hay empresa asociada a la sesión (actor_id).');
      return;
    }

    if (!silent) setIsLoading(true);
    try {
      const list = await transportistaService.listServices(requesterCompanyId);
      setServices(list);
      setError(null);
    } catch (e) {
      setError(getApiErrorMessage(e, 'No se pudieron cargar los servicios'));
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [requesterCompanyId]);

  const enabled = Boolean(requesterCompanyId);
  usePolling(() => refresh(true), POLL_MS, enabled);

  const activeService = useMemo(() => pickTransportistaActiveService(services), [services]);

  const getServiceById = useCallback(
    (id: string) => services.find((s) => s.service_id === id) ?? null,
    [services],
  );

  return {
    services,
    activeService,
    isLoading,
    error,
    refresh,
    getServiceById,
  };
}
