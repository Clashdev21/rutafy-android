import { useCallback, useMemo, useState } from 'react';

import { usePolling } from '@/hooks/usePolling';
import * as mensajeroService from '@/services/mensajeroService';
import type { Service } from '@/types/service';
import { getApiErrorMessage } from '@/utils/errors';
import { isValidUuid } from '@/utils/isValidUuid';
import {
  isMensajeroOperationalActive,
  pickMensajeroActiveService,
} from '@/utils/serviceStatus';

const POLL_MS = 15000;

export function useMensajeroOperations(actorId: string | null) {
  const [isOnline, setIsOnline] = useState(false);
  const [availabilitySyncing, setAvailabilitySyncing] = useState(false);
  const [myServices, setMyServices] = useState<Service[]>([]);
  const [availableServices, setAvailableServices] = useState<Service[]>([]);
  const [offerIdByServiceId, setOfferIdByServiceId] = useState<Record<string, string>>({});
  const [loadingMy, setLoadingMy] = useState(false);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [claimingServiceId, setClaimingServiceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canOperate = Boolean(actorId && isValidUuid(actorId));

  const refreshMyServices = useCallback(async (silent = false) => {
    if (!canOperate || !actorId) return;
    if (!silent) setLoadingMy(true);
    try {
      const list = await mensajeroService.fetchMyServices(actorId);
      setMyServices(list);
      setError(null);
    } catch (e) {
      setError(getApiErrorMessage(e, 'No se pudieron cargar mis servicios'));
    } finally {
      if (!silent) setLoadingMy(false);
    }
  }, [actorId, canOperate]);

  const refreshOffers = useCallback(async (silent = false) => {
    if (!canOperate || !actorId || !isOnline) {
      setAvailableServices([]);
      setOfferIdByServiceId({});
      return;
    }
    if (!silent) setLoadingOffers(true);
    try {
      const { services, offerIdByServiceId: map } =
        await mensajeroService.fetchActiveOffers(actorId);
      setAvailableServices(services);
      setOfferIdByServiceId(map);
    } catch (e) {
      setError(getApiErrorMessage(e, 'No se pudieron cargar las ofertas'));
    } finally {
      if (!silent) setLoadingOffers(false);
    }
  }, [actorId, canOperate, isOnline]);

  const refreshAll = useCallback(async (silent = false) => {
    await Promise.all([refreshMyServices(silent), refreshOffers(silent)]);
  }, [refreshMyServices, refreshOffers]);

  const activeService = useMemo(() => pickMensajeroActiveService(myServices), [myServices]);
  const hasActiveOperational = isMensajeroOperationalActive(activeService);
  const firstOffer = availableServices[0] ?? null;

  const pollEnabled = canOperate;
  usePolling(() => refreshAll(true), POLL_MS, pollEnabled);

  const toggleAvailability = useCallback(async () => {
    if (!actorId || !canOperate) {
      setError('No hay mensajero ID válido en la sesión');
      return;
    }
    const nextOnline = !isOnline;
    setAvailabilitySyncing(true);
    try {
      await mensajeroService.patchAvailability(
        actorId,
        nextOnline ? 'AVAILABLE' : 'OFFLINE',
      );
      setIsOnline(nextOnline);
      setError(null);
      if (!nextOnline) {
        setAvailableServices([]);
        setOfferIdByServiceId({});
      } else {
        await refreshOffers();
      }
    } catch (e) {
      setError(getApiErrorMessage(e, 'No se pudo actualizar la disponibilidad'));
    } finally {
      setAvailabilitySyncing(false);
    }
  }, [actorId, canOperate, isOnline, refreshOffers]);

  const acceptOffer = useCallback(
    async (serviceId: string) => {
      if (!actorId || !canOperate) return;
      const offerId = offerIdByServiceId[serviceId];
      if (!offerId) {
        setError('No se encontró offer_id para este servicio');
        return;
      }

      setClaimingServiceId(serviceId);
      try {
        await mensajeroService.acceptOffer(offerId, actorId);
        setAvailableServices((prev) => prev.filter((s) => s.service_id !== serviceId));
        setOfferIdByServiceId((prev) => {
          const next = { ...prev };
          delete next[serviceId];
          return next;
        });
        await refreshMyServices();
        await refreshOffers();
        setError(null);
      } catch (e) {
        const msg = getApiErrorMessage(e, 'No se pudo aceptar la oferta');
        setError(
          msg === 'mensajero_active_limit_reached'
            ? 'Ya tienes 6 servicios activos. Cierra uno antes de aceptar otro.'
            : msg,
        );
      } finally {
        setClaimingServiceId(null);
      }
    },
    [actorId, canOperate, offerIdByServiceId, refreshMyServices, refreshOffers],
  );

  const omitFirstOffer = useCallback(() => {
    setAvailableServices((prev) => {
      if (prev.length === 0) return prev;
      const omittedId = prev[0].service_id;
      setOfferIdByServiceId((m) => {
        const next = { ...m };
        delete next[omittedId];
        return next;
      });
      return prev.filter((s) => s.service_id !== omittedId);
    });
  }, []);

  const uiState = useMemo(() => {
    if (!isOnline && !hasActiveOperational) return 'OFFLINE' as const;
    if (activeService?.status === 'STARTED') return 'IN_SERVICE' as const;
    if (activeService?.status === 'CLAIMED') return 'ASSIGNED' as const;
    if (firstOffer) return 'OFFER' as const;
    if (isOnline) return 'AVAILABLE' as const;
    return 'OFFLINE' as const;
  }, [isOnline, hasActiveOperational, activeService, firstOffer]);

  return {
    isOnline,
    availabilitySyncing,
    myServices,
    availableServices,
    firstOffer,
    activeService,
    uiState,
    loadingMy,
    loadingOffers,
    claimingServiceId,
    error,
    canOperate,
    toggleAvailability,
    acceptOffer,
    omitFirstOffer,
    refreshAll,
    refreshMyServices,
    refreshOffers,
  };
}
