import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  endTrackingSession,
  fetchTrackingSession,
  sendTrackingPointsBatch,
  startTrackingSession,
} from '@/services/trackingSessionService';
import { requestForegroundGpsPermission } from '@/services/locationService';
import { trackingSessionStorage } from '@/storage/trackingSessionStorage';
import type {
  StoredTrackingSession,
  TrackingPointInput,
  TrackingSessionPurpose,
} from '@/types/tracking';
import { getApiErrorMessage } from '@/utils/errors';

const BATCH_FLUSH_MS = 12000;
const WATCH_TIME_INTERVAL_MS = 20000;
const WATCH_DISTANCE_INTERVAL_M = 10;

function shortSessionId(id: string): string {
  const compact = id.replace(/-/g, '');
  return compact.length > 8 ? compact.slice(0, 8) : compact;
}

function locationToPoint(update: Location.LocationObject): TrackingPointInput {
  const { coords, timestamp } = update;
  return {
    lat: coords.latitude,
    lng: coords.longitude,
    captured_at: new Date(timestamp).toISOString(),
    accuracy_m: Number.isFinite(coords.accuracy) ? coords.accuracy : null,
    speed_mps:
      coords.speed != null && Number.isFinite(coords.speed) && coords.speed >= 0
        ? coords.speed
        : null,
    heading:
      coords.heading != null && Number.isFinite(coords.heading) && coords.heading >= 0
        ? coords.heading
        : null,
    battery_level: null,
    app_state: 'foreground',
  };
}

export function useOperatorTrackingSession() {
  const [storedSession, setStoredSession] = useState<StoredTrackingSession | null>(null);
  const [remoteStatus, setRemoteStatus] = useState<string | null>(null);
  const [purpose, setPurpose] = useState<TrackingSessionPurpose>('operacion_interna');
  const [vehicleLabel, setVehicleLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pointsSent, setPointsSent] = useState(0);
  const [lastPointAt, setLastPointAt] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const bufferRef = useRef<TrackingPointInput[]>([]);
  const flushInFlightRef = useRef(false);
  const lastFlushAtRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const storedSessionRef = useRef<StoredTrackingSession | null>(null);

  const isActive = Boolean(storedSession?.sessionId);

  useEffect(() => {
    storedSessionRef.current = storedSession;
    sessionIdRef.current = storedSession?.sessionId ?? null;
  }, [storedSession]);

  const stopWatch = useCallback(() => {
    watchRef.current?.remove();
    watchRef.current = null;
    bufferRef.current = [];
  }, []);

  const flushBuffer = useCallback(async (sessionId: string) => {
    if (flushInFlightRef.current) return;
    const batch = bufferRef.current.splice(0, bufferRef.current.length);
    if (batch.length === 0) return;

    flushInFlightRef.current = true;
    try {
      if (__DEV__) {
        console.log('[tracking-points-batch]', {
          sessionId: shortSessionId(sessionId),
          count: batch.length,
        });
      }
      const { accepted } = await sendTrackingPointsBatch(sessionId, batch);
      setPointsSent((n) => n + accepted);
      const last = batch[batch.length - 1];
      setLastPointAt(last.captured_at);
      setError(null);
      lastFlushAtRef.current = Date.now();
      if (__DEV__) {
        console.log('[tracking-points-batch-ok]', { accepted });
      }
    } catch (e) {
      bufferRef.current.unshift(...batch);
      const msg = getApiErrorMessage(e, 'No se pudieron enviar puntos GPS');
      setError(msg);
      if (__DEV__) {
        console.warn('[tracking-points-batch-error]', msg);
      }
    } finally {
      flushInFlightRef.current = false;
    }
  }, []);

  const startWatch = useCallback(
    async (sessionId: string) => {
      const permission = await requestForegroundGpsPermission();
      if (permission !== 'granted') {
        throw new Error('Se necesita permiso de ubicación para capturar GPS.');
      }

      stopWatch();
      lastFlushAtRef.current = Date.now();

      watchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: WATCH_TIME_INTERVAL_MS,
          distanceInterval: WATCH_DISTANCE_INTERVAL_M,
        },
        (update) => {
          const sid = sessionIdRef.current;
          if (!sid) return;

          bufferRef.current.push(locationToPoint(update));
          const now = Date.now();
          if (
            now - lastFlushAtRef.current >= BATCH_FLUSH_MS ||
            bufferRef.current.length >= 5
          ) {
            void flushBuffer(sid);
          }
        },
      );
    },
    [flushBuffer, stopWatch],
  );

  const hydrateFromStorage = useCallback(async () => {
    setLoading(true);
    try {
      const local = await trackingSessionStorage.getActive();
      if (!local) {
        setStoredSession(null);
        setRemoteStatus(null);
        return;
      }

      setStoredSession(local);
      setPurpose(local.purpose);
      setVehicleLabel(local.vehicleLabel);

      try {
        const remote = await fetchTrackingSession(local.sessionId);
        if (remote) {
          setRemoteStatus(remote.status);
          if (remote.status !== 'active') {
            await trackingSessionStorage.clearActive();
            setStoredSession(null);
            stopWatch();
            return;
          }
        }
      } catch {
        setRemoteStatus('active');
      }

      await startWatch(local.sessionId);
    } finally {
      setLoading(false);
    }
  }, [startWatch, stopWatch]);

  useEffect(() => {
    void hydrateFromStorage();
    return () => {
      stopWatch();
    };
  }, [hydrateFromStorage, stopWatch]);

  useEffect(() => {
    if (!isActive || !storedSession?.startedAt) {
      setElapsedSeconds(0);
      return;
    }

    const started = new Date(storedSession.startedAt).getTime();
    const tick = () => {
      const sec = Math.max(0, Math.floor((Date.now() - started) / 1000));
      setElapsedSeconds(sec);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isActive, storedSession?.startedAt]);

  const startCapture = useCallback(async () => {
    if (storedSessionRef.current) {
      setError('Ya hay una captura logística activa.');
      return;
    }
    if (!consentAccepted) {
      setError('Debes aceptar el consentimiento para iniciar.');
      return;
    }
    const label = vehicleLabel.trim();
    if (!label) {
      setError('Indica la etiqueta del vehículo.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const session = await startTrackingSession({
        purpose,
        vehicle_label: label,
        consent_accepted: true,
        notes: notes.trim() || undefined,
        metadata: { source: 'android_mvp' },
      });

      const stored: StoredTrackingSession = {
        sessionId: session.id,
        purpose: session.purpose,
        vehicleLabel: session.vehicle_label || label,
        startedAt: session.started_at ?? new Date().toISOString(),
      };

      await trackingSessionStorage.setActive(stored);
      setStoredSession(stored);
      setRemoteStatus(session.status);
      setPointsSent(0);
      setLastPointAt(null);

      if (__DEV__) {
        console.log('[tracking-session-start]', {
          sessionId: shortSessionId(session.id),
          purpose: session.purpose,
        });
      }

      await startWatch(session.id);
    } catch (e) {
      setError(getApiErrorMessage(e, 'No se pudo iniciar la captura'));
    } finally {
      setBusy(false);
    }
  }, [consentAccepted, vehicleLabel, notes, purpose, startWatch]);

  const endCapture = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;

    setBusy(true);
    setError(null);
    try {
      await flushBuffer(sessionId);
      await endTrackingSession(sessionId);
      if (__DEV__) {
        console.log('[tracking-session-end]', { sessionId: shortSessionId(sessionId) });
      }
      await trackingSessionStorage.clearActive();
      setStoredSession(null);
      setRemoteStatus(null);
      stopWatch();
    } catch (e) {
      setError(getApiErrorMessage(e, 'No se pudo finalizar la captura'));
    } finally {
      setBusy(false);
    }
  }, [flushBuffer, stopWatch]);

  return {
    isActive,
    storedSession,
    shortSessionId: storedSession ? shortSessionId(storedSession.sessionId) : null,
    remoteStatus,
    purpose,
    setPurpose,
    vehicleLabel,
    setVehicleLabel,
    notes,
    setNotes,
    consentAccepted,
    setConsentAccepted,
    loading,
    busy,
    error,
    pointsSent,
    lastPointAt,
    elapsedSeconds,
    startCapture,
    endCapture,
    refresh: hydrateFromStorage,
  };
}
