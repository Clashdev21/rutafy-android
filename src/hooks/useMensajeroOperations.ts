import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { syncBackgroundTracking } from '@/services/backgroundLocationService';
import { useMessengerLocationHeartbeat } from '@/hooks/useMessengerLocationHeartbeat';
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

export function useMensajeroOperations(
  actorId: string | null,
  appRole: 'ADMIN' | 'TRANSPORTISTA' | 'MENSAJERO' | null,
  hasUser: boolean,
) {
  const lastActorIdRef = useRef<string | null>(null);
  const lastAppRoleRef = useRef<'MENSAJERO' | null>(null);

  const [isOnline, setIsOnline] = useState(false);
  const [availabilitySyncing, setAvailabilitySyncing] = useState(false);
  const [myServices, setMyServices] = useState<Service[]>([]);
  const [availableServices, setAvailableServices] = useState<Service[]>([]);
  const [offerIdByServiceId, setOfferIdByServiceId] = useState<Record<string, string>>({});
  const [loadingMy, setLoadingMy] = useState(false);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [claimingServiceId, setClaimingServiceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (actorId && isValidUuid(actorId)) {
      lastActorIdRef.current = actorId;
    }
    if (appRole === 'MENSAJERO') {
      lastAppRoleRef.current = appRole;
    }
  }, [actorId, appRole]);

  const activeService = useMemo(() => pickMensajeroActiveService(myServices), [myServices]);
  const hasActiveOperational = isMensajeroOperationalActive(activeService);

  const effectiveActorId = useMemo(() => {
    if (actorId && isValidUuid(actorId)) return actorId;
    if (hasActiveOperational && lastActorIdRef.current && isValidUuid(lastActorIdRef.current)) {
      return lastActorIdRef.current;
    }
    return null;
  }, [actorId, hasActiveOperational]);

  const effectiveAppRole = useMemo((): typeof appRole => {
    if (appRole === 'MENSAJERO') return appRole;
    if (hasActiveOperational && lastAppRoleRef.current === 'MENSAJERO') {
      return lastAppRoleRef.current;
    }
    return appRole;
  }, [appRole, hasActiveOperational]);

  const canOperate = Boolean(effectiveActorId && isValidUuid(effectiveActorId));

  const refreshMyServices = useCallback(async (silent = false) => {
    if (!canOperate || !effectiveActorId) return;
    if (!silent) setLoadingMy(true);
    try {
      const list = await mensajeroService.fetchMyServices(effectiveActorId);
      setMyServices(list);
      setError(null);
    } catch (e) {
      setError(getApiErrorMessage(e, 'No se pudieron cargar mis servicios'));
    } finally {
      if (!silent) setLoadingMy(false);
    }
  }, [effectiveActorId, canOperate]);

  const refreshOffers = useCallback(async (silent = false, forceOnline = false) => {
    if (!canOperate || !effectiveActorId || (!isOnline && !forceOnline)) {
      setAvailableServices([]);
      setOfferIdByServiceId({});
      return;
    }
    if (!silent) setLoadingOffers(true);
    try {
      const { services, offerIdByServiceId: map } =
        await mensajeroService.fetchActiveOffers(effectiveActorId);
      setAvailableServices(services);
      setOfferIdByServiceId(map);
    } catch (e) {
      setError(getApiErrorMessage(e, 'No se pudieron cargar las ofertas'));
    } finally {
      if (!silent) setLoadingOffers(false);
    }
  }, [effectiveActorId, canOperate, isOnline]);

  const refreshAll = useCallback(
    async (silent = false, forceOnline = false) => {
      await Promise.all([refreshMyServices(silent), refreshOffers(silent, forceOnline)]);
    },
    [refreshMyServices, refreshOffers],
  );

  const effectiveIsOnline = isOnline || hasActiveOperational;
  const firstOffer = availableServices[0] ?? null;

  const pollEnabled = canOperate;
  usePolling(() => refreshAll(true), POLL_MS, pollEnabled);

  const toggleAvailability = useCallback(async () => {
    if (!effectiveActorId || !canOperate) {
      setError('No hay mensajero ID válido en la sesión');
      return;
    }
    const nextOnline = !isOnline;
    setAvailabilitySyncing(true);
    try {
      await mensajeroService.patchAvailability(
        effectiveActorId,
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
  }, [effectiveActorId, canOperate, isOnline, refreshOffers]);

  const acceptOffer = useCallback(
    async (serviceId: string) => {
      if (!effectiveActorId || !canOperate) return;
      const offerId = offerIdByServiceId[serviceId];
      if (!offerId) {
        setError('No se encontró offer_id para este servicio');
        return;
      }

      setClaimingServiceId(serviceId);
      try {
        await mensajeroService.acceptOffer(offerId, effectiveActorId);
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
    [effectiveActorId, canOperate, offerIdByServiceId, refreshMyServices, refreshOffers],
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
    if (!effectiveIsOnline) return 'OFFLINE' as const;
    if (activeService?.status === 'STARTED') return 'IN_SERVICE' as const;
    if (activeService?.status === 'CLAIMED') return 'ASSIGNED' as const;
    if (firstOffer) return 'OFFER' as const;
    return 'AVAILABLE' as const;
  }, [effectiveIsOnline, activeService, firstOffer]);

  const locationHeartbeat = useMessengerLocationHeartbeat({
    enabled: canOperate && effectiveAppRole === 'MENSAJERO',
    isOnline: effectiveIsOnline,
    uiState,
  });

  const shouldEnableBackgroundTracking =
    canOperate &&
    effectiveAppRole === 'MENSAJERO' &&
    (uiState === 'ASSIGNED' || uiState === 'IN_SERVICE');

  useEffect(() => {
    if (__DEV__) {
      console.log('[bg-tracking-effect]', {
        actorId: effectiveActorId,
        isActorIdValid: effectiveActorId ? isValidUuid(effectiveActorId) : false,
        hasUser,
        appRole: effectiveAppRole,
        canOperate,
        uiState,
        activeServiceStatus: activeService?.status ?? null,
        shouldEnableBackgroundTracking,
      });
    }
    void syncBackgroundTracking(shouldEnableBackgroundTracking);
  }, [
    shouldEnableBackgroundTracking,
    effectiveActorId,
    effectiveAppRole,
    hasUser,
    canOperate,
    uiState,
    activeService?.status,
  ]);

  useEffect(() => {
    return () => {
      void syncBackgroundTracking(false);
    };
  }, []);

  const handleCloseSuccess = useCallback(async () => {
    if (!effectiveActorId || !canOperate) return;

    setAvailabilitySyncing(true);
    try {
      await mensajeroService.patchAvailability(effectiveActorId, 'AVAILABLE');
      setIsOnline(true);
      setError(null);
      await refreshAll(false, true);
    } catch (e) {
      setError(getApiErrorMessage(e, 'No se pudo restaurar la disponibilidad'));
    } finally {
      setAvailabilitySyncing(false);
    }
  }, [effectiveActorId, canOperate, refreshAll]);

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
    gpsStatus: locationHeartbeat.gpsStatus,
    hasLocationFix: locationHeartbeat.hasLocationFix,
    toggleAvailability,
    acceptOffer,
    omitFirstOffer,
    handleCloseSuccess,
    refreshAll,
    refreshMyServices,
    refreshOffers,
  };
}
