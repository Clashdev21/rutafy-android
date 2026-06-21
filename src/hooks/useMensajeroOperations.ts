import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getMensajeroPollConfig } from '@/constants/mensajeroPollIntervals';
import { syncBackgroundTracking } from '@/services/backgroundLocationService';
import { useMessengerLocationHeartbeat } from '@/hooks/useMessengerLocationHeartbeat';
import { usePolling } from '@/hooks/usePolling';
import * as mensajeroService from '@/services/mensajeroService';
import {
  consumePendingDispatchOfferIntent,
  isDispatchOfferIntentExpired,
  peekPendingDispatchOfferIntent,
  subscribePushIntentListener,
  type DispatchOfferIntent,
} from '@/services/pushNavigationIntent';
import type { Service } from '@/types/service';
import { getApiErrorMessage } from '@/utils/errors';
import { isValidUuid } from '@/utils/isValidUuid';
import { reorderOffersForIntent } from '@/utils/reorderOffersForIntent';
import {
  isMensajeroOperationalActive,
  pickMensajeroActiveService,
} from '@/utils/serviceStatus';

export type OffersRefreshSource =
  | 'poller'
  | 'toggle'
  | 'refreshAll'
  | 'acceptOffer'
  | 'pullToRefresh'
  | 'startService'
  | 'closeSuccess'
  | 'manual'
  | 'push';

export type RefreshOffersOptions = {
  silent?: boolean;
  forceOnline?: boolean;
  source: OffersRefreshSource;
  prioritizeOfferId?: string;
  prioritizeServiceId?: string;
};

export type RefreshAllOptions = {
  silent?: boolean;
  forceOnline?: boolean;
  source: OffersRefreshSource;
};

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
  const [pushOfferActive, setPushOfferActive] = useState(false);
  const [pushOfferNotice, setPushOfferNotice] = useState<string | null>(null);

  const refreshMyInFlightRef = useRef(false);
  const refreshOffersInFlightRef = useRef(false);
  const pushIntentInFlightRef = useRef(false);

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
    if (__DEV__) {
      console.log('[my-services-refresh-start]', { silent, isOnline });
    }
    if (!silent) setLoadingMy(true);
    const startedAt = Date.now();
    try {
      const list = await mensajeroService.fetchMyServices(effectiveActorId);
      setMyServices(list);
      setError(null);
    } catch (e) {
      setError(getApiErrorMessage(e, 'No se pudieron cargar mis servicios'));
    } finally {
      if (!silent) setLoadingMy(false);
      if (__DEV__) {
        console.log('[my-services-refresh-end]', { silent, durationMs: Date.now() - startedAt });
      }
    }
  }, [effectiveActorId, canOperate, isOnline]);

  const effectiveIsOnline = isOnline || hasActiveOperational;
  const firstOffer = availableServices[0] ?? null;

  const uiState = useMemo(() => {
    if (activeService?.status === 'STARTED') return 'IN_SERVICE' as const;
    if (activeService?.status === 'CLAIMED') return 'ASSIGNED' as const;
    if ((effectiveIsOnline || pushOfferActive) && firstOffer) return 'OFFER' as const;
    if (!effectiveIsOnline) return 'OFFLINE' as const;
    if (firstOffer) return 'OFFER' as const;
    return 'AVAILABLE' as const;
  }, [effectiveIsOnline, activeService, firstOffer, pushOfferActive]);

  const pollConfig = useMemo(() => getMensajeroPollConfig(uiState), [uiState]);

  const refreshOffers = useCallback(
    async (options: RefreshOffersOptions) => {
      const { silent = false, forceOnline = false, source } = options;
      const logContext = {
        source,
        uiState,
        isOnline,
        offersMs: pollConfig.offersMs,
        timestamp: Date.now(),
      };

      if (!canOperate || !effectiveActorId || (!isOnline && !forceOnline)) {
        if (__DEV__) {
          console.log('[offers-refresh-skip-offline]', logContext);
        }
        if (!forceOnline) {
          setAvailableServices([]);
          setOfferIdByServiceId({});
        }
        return;
      }

      if (refreshOffersInFlightRef.current) {
        if (__DEV__) {
          console.log('[offers-refresh-skip-in-flight]', {
            source,
            uiState,
            timestamp: Date.now(),
          });
        }
        return;
      }

      refreshOffersInFlightRef.current = true;
      const startedAt = Date.now();
      if (__DEV__) {
        console.log('[offers-refresh-start]', {
          ...logContext,
          inFlight: true,
        });
      }
      if (!silent) setLoadingOffers(true);
      try {
        const { services, offerIdByServiceId: map } =
          await mensajeroService.fetchActiveOffers(effectiveActorId);

        const prioritizeOfferId = options.prioritizeOfferId?.trim() ?? '';
        const prioritizeServiceId = options.prioritizeServiceId?.trim() ?? '';
        if (prioritizeOfferId || prioritizeServiceId) {
          const reordered = reorderOffersForIntent(
            services,
            map,
            prioritizeOfferId,
            prioritizeServiceId,
          );
          setAvailableServices(reordered.services);
          setOfferIdByServiceId(reordered.offerIdByServiceId);
          if (reordered.matched) {
            setPushOfferActive(true);
            setPushOfferNotice(null);
          } else {
            setPushOfferActive(false);
            setPushOfferNotice('La oferta ya no está disponible o expiró.');
          }
        } else {
          setAvailableServices(services);
          setOfferIdByServiceId(map);
        }
      } catch (e) {
        setError(getApiErrorMessage(e, 'No se pudieron cargar las ofertas'));
      } finally {
        refreshOffersInFlightRef.current = false;
        if (!silent) setLoadingOffers(false);
        if (__DEV__) {
          console.log('[offers-refresh-end]', {
            source,
            durationMs: Date.now() - startedAt,
          });
        }
      }
    },
    [effectiveActorId, canOperate, isOnline, uiState, pollConfig.offersMs],
  );

  const refreshAll = useCallback(
    async (options: RefreshAllOptions) => {
      const { silent = false, forceOnline = false, source } = options;
      await Promise.all([
        refreshMyServices(silent),
        refreshOffers({ silent, forceOnline, source }),
      ]);
    },
    [refreshMyServices, refreshOffers],
  );

  const pollRefreshMyServices = useCallback(async () => {
    if (refreshMyInFlightRef.current) return;
    refreshMyInFlightRef.current = true;
    try {
      await refreshMyServices(true);
    } finally {
      refreshMyInFlightRef.current = false;
    }
  }, [refreshMyServices]);

  const pollRefreshOffers = useCallback(() => {
    void refreshOffers({ silent: true, source: 'poller' });
  }, [refreshOffers]);
  const offersPollEnabled = canOperate && pollConfig.offersEnabled;
  const servicesPollEnabled = canOperate && pollConfig.servicesEnabled;

  usePolling(pollRefreshOffers, pollConfig.offersMs, offersPollEnabled);
  usePolling(pollRefreshMyServices, pollConfig.servicesMs, servicesPollEnabled);

  useEffect(() => {
    if (__DEV__) {
      console.log('[mensajero-poll]', {
        uiState,
        offersMs: pollConfig.offersMs,
        servicesMs: pollConfig.servicesMs,
        offersPollEnabled,
        servicesPollEnabled,
      });
    }
  }, [uiState, pollConfig, offersPollEnabled, servicesPollEnabled]);

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
        await refreshOffers({ source: 'toggle' });
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
        await refreshOffers({ source: 'acceptOffer' });
        setPushOfferActive(false);
        setPushOfferNotice(null);
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
    setPushOfferActive(false);
    setPushOfferNotice(null);
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
      await refreshAll({ silent: false, forceOnline: true, source: 'closeSuccess' });
    } catch (e) {
      setError(getApiErrorMessage(e, 'No se pudo restaurar la disponibilidad'));
    } finally {
      setAvailabilitySyncing(false);
    }
  }, [effectiveActorId, canOperate, refreshAll]);

  const getServiceById = useCallback(
    (id: string) => myServices.find((s) => s.service_id === id) ?? null,
    [myServices],
  );

  const processPushDispatchIntent = useCallback(async () => {
    if (!canOperate || pushIntentInFlightRef.current) return;

    const pending = peekPendingDispatchOfferIntent();
    if (!pending) return;

    pushIntentInFlightRef.current = true;
    const intent: DispatchOfferIntent | null = consumePendingDispatchOfferIntent();
    if (!intent) {
      pushIntentInFlightRef.current = false;
      return;
    }

    if (isDispatchOfferIntentExpired(intent)) {
      setPushOfferActive(false);
      setPushOfferNotice('La oferta ya no está disponible o expiró.');
      pushIntentInFlightRef.current = false;
      return;
    }

    if (__DEV__) {
      console.log('[push-intent-process]', { source: 'mensajero' });
    }

    try {
      await refreshOffers({
        silent: true,
        forceOnline: true,
        source: 'push',
        prioritizeOfferId: intent.offerId,
        prioritizeServiceId: intent.serviceId,
      });
    } finally {
      pushIntentInFlightRef.current = false;
    }
  }, [canOperate, refreshOffers]);

  useEffect(() => {
    return subscribePushIntentListener(() => {
      void processPushDispatchIntent();
    });
  }, [processPushDispatchIntent]);

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
    pushOfferNotice,
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
    processPushDispatchIntent,
    getServiceById,
  };
}
