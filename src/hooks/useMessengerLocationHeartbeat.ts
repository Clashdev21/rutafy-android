import { useEffect, useMemo, useRef, useState } from 'react';
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
  const [isForeground, setIsForeground] = useState(AppState.currentState === 'active');
  const latestPositionRef = useRef<GpsPosition | null>(null);
  const watchSubscriptionRef = useRef<Location.LocationSubscription | null>(null);

  const canRun = useMemo(
    () =>
      params.enabled &&
      isForeground &&
      (params.uiState === 'AVAILABLE' ||
        params.uiState === 'ASSIGNED' ||
        params.uiState === 'IN_SERVICE'),
    [params.enabled, isForeground, params.uiState],
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      setIsForeground(nextState === 'active');
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!canRun) {
      watchSubscriptionRef.current?.remove();
      watchSubscriptionRef.current = null;
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
          return;
        }

        const current = await getCurrentGpsPosition();
        if (cancelled) return;
        latestPositionRef.current = current;
        setStatus('active');
        console.log('[gps-position]', current);

        watchSubscriptionRef.current?.remove();
        watchSubscriptionRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 10000,
            distanceInterval: 0,
          },
          (update) => {
            const next = {
              lat: update.coords.latitude,
              lng: update.coords.longitude,
              accuracyM: Number.isFinite(update.coords.accuracy) ? update.coords.accuracy : null,
              timestamp: update.timestamp,
            };
            latestPositionRef.current = next;
            setStatus('active');
            console.log('[gps-position]', next);
          },
        );
      } catch (error) {
        if (cancelled) return;
        setStatus('unavailable');
        console.log('[heartbeat-error]', error);
      }
    };

    void startLocation();

    return () => {
      cancelled = true;
      watchSubscriptionRef.current?.remove();
      watchSubscriptionRef.current = null;
    };
  }, [canRun]);

  useEffect(() => {
    if (!canRun) return;

    let disposed = false;

    const sendHeartbeat = async () => {
      try {
        const payload: MessengerHeartbeatPayload = {};
        const availability = resolveAvailabilityStatus(params.isOnline, params.uiState);
        if (availability !== undefined) {
          payload.availability_status = availability;
        }

        if (hasValidLatLng(latestPositionRef.current)) {
          payload.lat = latestPositionRef.current.lat;
          payload.lng = latestPositionRef.current.lng;
        }

        console.log('[heartbeat-payload]', payload);
        const response = await postHeartbeat(payload);
        if (disposed) return;
        console.log('[heartbeat-response]', response);
      } catch (error) {
        if (disposed) return;
        console.log('[heartbeat-error]', error);
      }
    };

    void sendHeartbeat();
    const timer = setInterval(() => {
      void sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [canRun, params.isOnline, params.uiState]);

  return {
    gpsStatus: status,
    hasLocationFix: hasValidLatLng(latestPositionRef.current),
  };
}
