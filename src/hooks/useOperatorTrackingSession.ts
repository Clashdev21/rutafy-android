import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useAuth } from '@/auth/useAuth';
import {
  cancelTrackingSession,
  endTrackingSession,
  fetchTrackingSession,
  sendTrackingPointsBatch,
  startTrackingSession,
} from '@/services/trackingSessionService';
import { requestForegroundGpsPermission } from '@/services/locationService';
import {
  ensureOperatorBackgroundTracking,
  isOperatorTrackingStartedAsync,
  startOperatorTrackingAsync,
  stopOperatorTrackingAsync,
} from '@/services/operatorTrackingService';
import { operatorTrackingHealthStorage } from '@/storage/operatorTrackingHealthStorage';
import { trackingSessionStorage } from '@/storage/trackingSessionStorage';
import type {
  StoredTrackingSession,
  TrackingPointInput,
  TrackingSessionPurpose,
} from '@/types/tracking';
import { getApiErrorMessage } from '@/utils/errors';
import { assertCanStartOperatorCapture } from '@/utils/operatorTrackingGuards';
import { logOperatorBgHealth } from '@/utils/operatorTrackingHealthAudit';
import {
  buildStoredTrackingSession,
  cleanupLocalTrackingSession,
  clearActiveTrackingSession,
  isStoredTrackingSessionOwnedByUser,
  isTrackingSessionForbiddenOrNotFound,
  isTrackingSessionNotActiveError,
} from '@/utils/trackingSessionOwnership';
import { toTrackingPoint } from '@/utils/trackingPointMapper';

const BATCH_FLUSH_MS = 12000;
const WATCH_TIME_INTERVAL_MS = 20000;
const WATCH_DISTANCE_INTERVAL_M = 10;
const FG_POINT_METADATA = { source: 'android_mvp' as const };

function shortSessionId(id: string): string {
  const compact = id.replace(/-/g, '');
  return compact.length > 8 ? compact.slice(0, 8) : compact;
}

export function useOperatorTrackingSession() {
  const { user, isLoading: authLoading } = useAuth();
  const actorId = user?.actor_id?.trim() ?? null;
  const appRole = user?.appRole ?? null;

  const [storedSession, setStoredSession] = useState<StoredTrackingSession | null>(null);
  const [remoteStatus, setRemoteStatus] = useState<string | null>(null);
  const [purpose, setPurpose] = useState<TrackingSessionPurpose>('operacion_interna');
  const [vehicleLabel, setVehicleLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [closingAction, setClosingAction] = useState<'end' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pointsSent, setPointsSent] = useState(0);
  const [lastPointAt, setLastPointAt] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [operatorBgActive, setOperatorBgActive] = useState(false);
  const [healthRefreshKey, setHealthRefreshKey] = useState(0);

  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const bufferRef = useRef<TrackingPointInput[]>([]);
  const flushInFlightRef = useRef(false);
  const lastFlushAtRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const storedSessionRef = useRef<StoredTrackingSession | null>(null);
  const operatorBgActiveRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const isActive = Boolean(storedSession?.sessionId);

  useEffect(() => {
    storedSessionRef.current = storedSession;
    sessionIdRef.current = storedSession?.sessionId ?? null;
  }, [storedSession]);

  useEffect(() => {
    operatorBgActiveRef.current = operatorBgActive;
  }, [operatorBgActive]);

  const syncOperatorBgState = useCallback(async () => {
    const started = await isOperatorTrackingStartedAsync();
    operatorBgActiveRef.current = started;
    setOperatorBgActive(started);
    return started;
  }, []);

  const runOperatorBgHealthCheck = useCallback(async () => {
    await syncOperatorBgState();
    await logOperatorBgHealth();
    setHealthRefreshKey((n) => n + 1);
  }, [syncOperatorBgState]);

  const stopWatch = useCallback(() => {
    watchRef.current?.remove();
    watchRef.current = null;
    bufferRef.current = [];
  }, []);

  const stopOperatorBackground = useCallback(async () => {
    await stopOperatorTrackingAsync();
    operatorBgActiveRef.current = false;
    setOperatorBgActive(false);
  }, []);

  const resetInactiveSessionState = useCallback(() => {
    setStoredSession(null);
    setRemoteStatus(null);
    setOperatorBgActive(false);
    operatorBgActiveRef.current = false;
    setElapsedSeconds(0);
    setPointsSent(0);
    setLastPointAt(null);
    setClosingAction(null);
  }, []);

  const handleSessionClosedRemotely = useCallback(async () => {
    stopWatch();
    await cleanupLocalTrackingSession('session_not_active');
    resetInactiveSessionState();
    setSuccessMessage('La captura ya fue cerrada remotamente.');
  }, [resetInactiveSessionState, stopWatch]);

  const flushBuffer = useCallback(async (sessionId: string) => {
    if (operatorBgActiveRef.current) {
      bufferRef.current = [];
      return;
    }

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
      if (isTrackingSessionNotActiveError(e)) {
        await handleSessionClosedRemotely();
        return;
      }
      bufferRef.current.unshift(...batch);
      const msg = getApiErrorMessage(e, 'No se pudieron enviar puntos GPS');
      setError(msg);
      if (__DEV__) {
        console.warn('[tracking-points-batch-error]', msg);
      }
    } finally {
      flushInFlightRef.current = false;
    }
  }, [handleSessionClosedRemotely]);

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

          const point = toTrackingPoint(update, 'foreground', FG_POINT_METADATA);
          if (!point) return;

          setLastPointAt(point.captured_at);

          if (operatorBgActiveRef.current) {
            return;
          }

          bufferRef.current.push(point);
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

  const startOperatorBackground = useCallback(async (): Promise<boolean> => {
    const started = await startOperatorTrackingAsync();
    operatorBgActiveRef.current = started;
    setOperatorBgActive(started);
    return started;
  }, []);

  const hydrateFromStorage = useCallback(async () => {
    setLoading(true);
    try {
      if (authLoading) return;

      const local = await trackingSessionStorage.getActive();
      if (!local) {
        resetInactiveSessionState();
        return;
      }

      if (!isStoredTrackingSessionOwnedByUser(local, user)) {
        await clearActiveTrackingSession('owner_mismatch');
        stopWatch();
        resetInactiveSessionState();
        return;
      }

      setStoredSession(local);
      setPurpose(local.purpose);
      setVehicleLabel(local.vehicleLabel);

      try {
        const remote = await fetchTrackingSession(local.sessionId);
        if (!remote || remote.status !== 'active') {
          await clearActiveTrackingSession('remote_inactive');
          stopWatch();
          resetInactiveSessionState();
          return;
        }
        setRemoteStatus(remote.status);
      } catch (e) {
        if (isTrackingSessionForbiddenOrNotFound(e)) {
          await clearActiveTrackingSession('remote_forbidden');
          stopWatch();
          resetInactiveSessionState();
          return;
        }
        setRemoteStatus('active');
      }

      const bgOk = await ensureOperatorBackgroundTracking();
      operatorBgActiveRef.current = bgOk;
      setOperatorBgActive(bgOk);

      await startWatch(local.sessionId);
    } finally {
      setLoading(false);
    }
  }, [authLoading, resetInactiveSessionState, startWatch, stopWatch, user]);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }
    void hydrateFromStorage();
    return () => {
      stopWatch();
    };
  }, [
    authLoading,
    hydrateFromStorage,
    stopWatch,
    user?.user_id,
    user?.actor_id,
    user?.actor_type,
  ]);

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

  useEffect(() => {
    if (!isActive) return;

    const sub = AppState.addEventListener('change', (nextState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;
      const wasBackground = prev === 'background' || prev === 'inactive';
      if (wasBackground && nextState === 'active') {
        void runOperatorBgHealthCheck();
      }
    });

    return () => sub.remove();
  }, [isActive, runOperatorBgHealthCheck]);

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
    setSuccessMessage(null);
    try {
      if (!user) {
        throw new Error('Debes iniciar sesión para iniciar la captura.');
      }

      await assertCanStartOperatorCapture(actorId, appRole);

      const session = await startTrackingSession({
        purpose,
        vehicle_label: label,
        consent_accepted: true,
        notes: notes.trim() || undefined,
        metadata: { source: 'android_mvp' },
      });

      const stored = buildStoredTrackingSession(session, user, label);

      await operatorTrackingHealthStorage.clear();
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

      const bgOk = await startOperatorBackground();
      if (!bgOk) {
        setError(
          'Captura iniciada sin segundo plano. Concede ubicación en segundo plano para registrar con pantalla apagada.',
        );
      }

      await startWatch(session.id);
      void runOperatorBgHealthCheck();
    } catch (e) {
      setError(getApiErrorMessage(e, 'No se pudo iniciar la captura'));
    } finally {
      setBusy(false);
    }
  }, [
    actorId,
    appRole,
    consentAccepted,
    vehicleLabel,
    notes,
    purpose,
    startWatch,
    startOperatorBackground,
    user,
    runOperatorBgHealthCheck,
  ]);

  const finalizeCaptureLocally = useCallback(async () => {
    await stopOperatorBackground();
    stopWatch();
    await cleanupLocalTrackingSession('capture_closed');
    resetInactiveSessionState();
  }, [resetInactiveSessionState, stopOperatorBackground, stopWatch]);

  const endCapture = useCallback(async (): Promise<string | null> => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return null;

    setBusy(true);
    setClosingAction('end');
    setError(null);
    setSuccessMessage(null);
    if (__DEV__) {
      console.log('[tracking-end-start]', { sessionId: shortSessionId(sessionId) });
    }
    try {
      await flushBuffer(sessionId);
      const result = await endTrackingSession(sessionId);
      if (__DEV__) {
        console.log('[tracking-end-ok]', {
          sessionId: shortSessionId(result.session.session_id),
          status: result.session.status,
        });
      }
      await finalizeCaptureLocally();
      setSuccessMessage('Captura finalizada correctamente.');
      return result.session.session_id;
    } catch (e) {
      const msg = getApiErrorMessage(e, 'No se pudo finalizar la captura');
      setError(msg);
      if (__DEV__) {
        console.warn('[tracking-end-error]', { sessionId: shortSessionId(sessionId), msg });
      }
      return null;
    } finally {
      setBusy(false);
      setClosingAction(null);
    }
  }, [finalizeCaptureLocally, flushBuffer]);

  const cancelCapture = useCallback(async (): Promise<boolean> => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return false;

    setBusy(true);
    setClosingAction('cancel');
    setError(null);
    setSuccessMessage(null);
    if (__DEV__) {
      console.log('[tracking-cancel-start]', { sessionId: shortSessionId(sessionId) });
    }
    try {
      await flushBuffer(sessionId);
      const result = await cancelTrackingSession(sessionId);
      if (__DEV__) {
        console.log('[tracking-cancel-ok]', {
          sessionId: shortSessionId(result.session.session_id),
          status: result.session.status,
        });
      }
      await finalizeCaptureLocally();
      setSuccessMessage('Captura cancelada');
      return true;
    } catch (e) {
      const msg = getApiErrorMessage(e, 'No se pudo cancelar la captura');
      setError(msg);
      if (__DEV__) {
        console.warn('[tracking-cancel-error]', { sessionId: shortSessionId(sessionId), msg });
      }
      return false;
    } finally {
      setBusy(false);
      setClosingAction(null);
    }
  }, [finalizeCaptureLocally, flushBuffer]);

  return {
    isActive,
    operatorBgActive,
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
    closingAction,
    error,
    successMessage,
    clearSuccessMessage: () => setSuccessMessage(null),
    pointsSent,
    lastPointAt,
    elapsedSeconds,
    startCapture,
    endCapture,
    cancelCapture,
    refresh: hydrateFromStorage,
    syncOperatorBgState,
    runOperatorBgHealthCheck,
    healthRefreshKey,
  };
}
