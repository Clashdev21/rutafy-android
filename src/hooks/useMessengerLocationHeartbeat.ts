import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';

import { postHeartbeat, type MessengerHeartbeatPayload } from '@/services/mensajeroService';
import {
  getCurrentGpsPosition,
  hasValidLatLng,
  requestForegroundGpsPermission,
  type GpsPosition,
} from '@/services/locationService';

const HEARTBEAT_INTERVAL_MS = 30000;
const HEARTBEAT_THROTTLE_MS = 25000;
const MIN_COORD_DELTA = 0.0001;

type OperationalUiState = 'OFFLINE' | 'AVAILABLE' | 'OFFER' | 'ASSIGNED' | 'IN_SERVICE';
type GpsIndicatorStatus = 'active' | 'unavailable' | 'permission-pending';

function resolveAvailabilityStatus(
  isOnline: boolean,
  uiState: OperationalUiState,
): MessengerHeartbeatPayload['availability_status'] | undefined {
  if (!isOnline) return 'OFFLINE';
  if (uiState === 'ASSIGNED' || uiState === 'IN_SERVICE') return undefined;
  if (uiState === 'AVAILABLE') return 'AVAILABLE';
  return undefined;
}

export function useMessengerLocationHeartbeat(params: {
  enabled: boolean;
  isOnline: boolean;
  uiState: OperationalUiState;
}) {
  const [status, setStatus] = useState<GpsIndicatorStatus>('permission-pending');
  const [hasLocationFix, setHasLocationFix] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const isSendingRef = useRef(false);
  const lastSentAtRef = useRef(0);
  const hasSentInitialRef = useRef(false);
  const isOnlineRef = useRef(params.isOnline);
  const uiStateRef = useRef<OperationalUiState>(params.uiState);
  const appStateRef = useRef(AppState.currentState);
  const lastFixRef = useRef<GpsPosition | null>(null);
  const canRunRef = useRef(false);
  const statusRef = useRef<GpsIndicatorStatus>('permission-pending');
  const hasLocationFixRef = useRef(false);

  const canRun =
    params.enabled &&
    (params.uiState === 'AVAILABLE' ||
      params.uiState === 'ASSIGNED' ||
      params.uiState === 'IN_SERVICE');

  useEffect(() => {
    isOnlineRef.current = params.isOnline;
  }, [params.isOnline]);

  useEffect(() => {
    uiStateRef.current = params.uiState;
  }, [params.uiState]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    hasLocationFixRef.current = hasLocationFix;
  }, [hasLocationFix]);

  const sendHeartbeat = useCallback(
    async (reason: 'initial' | 'interval' | 'resume') => {
      if (isSendingRef.current) return;

      const now = Date.now();
      const isInitial = reason === 'initial';

      if (isInitial && hasSentInitialRef.current) return;
      if (!isInitial && now - lastSentAtRef.current < HEARTBEAT_THROTTLE_MS) {
        console.log('[heartbeat-skip-throttle]', {
          reason,
          msSinceLast: now - lastSentAtRef.current,
        });
        return;
      }

      if (isInitial) {
        hasSentInitialRef.current = true;
      }

      isSendingRef.current = true;
      try {
        const payload: MessengerHeartbeatPayload = {};
        const availability = resolveAvailabilityStatus(isOnlineRef.current, uiStateRef.current);
        if (availability !== undefined) {
          payload.availability_status = availability;
        }

        if (hasValidLatLng(lastFixRef.current)) {
          payload.lat = lastFixRef.current.lat;
          payload.lng = lastFixRef.current.lng;
        }

        console.log('[heartbeat-payload]', { reason, payload });
        const response = await postHeartbeat(payload);
        lastSentAtRef.current = Date.now();
        console.log('[heartbeat-response]', response);
      } catch (error) {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 429) {
          console.warn('[heartbeat-error]', { reason, type: 'rate-limit', status });
          return;
        }
        console.warn('[heartbeat-error]', { reason, error });
      } finally {
        isSendingRef.current = false;
      }
    },
    [],
  );

  const stopHeartbeatLoop = useCallback(() => {
    if (intervalRef.current != null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      console.log('[heartbeat-stop]');
    }
  }, []);

  const startHeartbeatLoop = useCallback(() => {
    if (intervalRef.current != null) return;
    console.log('[heartbeat-start]');
    if (!hasSentInitialRef.current) {
      void sendHeartbeat('initial');
    }
    intervalRef.current = setInterval(() => {
      void sendHeartbeat('interval');
    }, HEARTBEAT_INTERVAL_MS);
  }, [sendHeartbeat]);

  useEffect(() => {
    canRunRef.current = canRun;
  }, [canRun]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      if (nextState === 'active') {
        if (canRunRef.current) {
          startHeartbeatLoop();
          void sendHeartbeat('resume');
        }
        return;
      }
      stopHeartbeatLoop();
    });
    return () => sub.remove();
  }, [sendHeartbeat, startHeartbeatLoop, stopHeartbeatLoop]);

  useEffect(() => {
    if (!canRun) {
      stopHeartbeatLoop();
      watchSubscriptionRef.current?.remove();
      watchSubscriptionRef.current = null;
      hasSentInitialRef.current = false;
      return;
    }

    let cancelled = false;
    const startLocation = async () => {
      try {
        const permission = await requestForegroundGpsPermission();
        console.log('[gps-permission]', permission);
        if (cancelled) return;

        if (permission !== 'granted') {
          setStatus('permission-pending');
          if (hasLocationFixRef.current) {
            setHasLocationFix(false);
          }
          return;
        }

        const current = await getCurrentGpsPosition();
        if (cancelled) return;
        lastFixRef.current = current;
        if (!hasLocationFixRef.current) {
          setHasLocationFix(true);
        }
        setStatus('active');
        console.log('[gps-position]', current);

        watchSubscriptionRef.current?.remove();
        console.log('[gps-watch-start]');
        watchSubscriptionRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 10000,
            distanceInterval: 10,
          },
          (update) => {
            const next = {
              lat: update.coords.latitude,
              lng: update.coords.longitude,
              accuracyM: Number.isFinite(update.coords.accuracy) ? update.coords.accuracy : null,
              timestamp: update.timestamp,
            };
            const prev = lastFixRef.current;
            const changedEnough =
              !prev ||
              Math.abs(next.lat - prev.lat) >= MIN_COORD_DELTA ||
              Math.abs(next.lng - prev.lng) >= MIN_COORD_DELTA;

            lastFixRef.current = next;
            if (changedEnough || statusRef.current !== 'active') {
              setStatus('active');
            }
            if (!hasLocationFixRef.current) {
              setHasLocationFix(true);
            }
            console.log('[gps-position]', next);
          },
        );
      } catch (error) {
        if (cancelled) return;
        setStatus('unavailable');
        console.warn('[heartbeat-error]', error);
      }
    };

    void startLocation();
    if (appStateRef.current === 'active') {
      startHeartbeatLoop();
    }

    return () => {
      cancelled = true;
      watchSubscriptionRef.current?.remove();
      watchSubscriptionRef.current = null;
      console.log('[gps-watch-stop]');
      stopHeartbeatLoop();
    };
  }, [canRun, sendHeartbeat, startHeartbeatLoop, stopHeartbeatLoop]);

  useEffect(() => {
    return () => {
      stopHeartbeatLoop();
      watchSubscriptionRef.current?.remove();
      watchSubscriptionRef.current = null;
      console.log('[gps-watch-stop]');
    };
  }, [stopHeartbeatLoop]);

  return {
    gpsStatus: status,
    hasLocationFix,
  };
}
