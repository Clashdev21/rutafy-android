import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useAuth } from '@/auth/useAuth';
import { syncMensajeroOperationalBootstrap } from '@/services/mensajeroBootstrapRuntime';
import type { MensajeroBootstrapSource } from '@/types/operationalBootstrap';
import type { BootstrapCycleResult } from '@/utils/mensajeroBootstrapCoordinator';

export function useMensajeroOperationalBootstrap(enabled: boolean) {
  const { user } = useAuth();
  const userRef = useRef(user);
  userRef.current = user;

  const [notice, setNotice] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [needsRetryOnReconnect, setNeedsRetryOnReconnect] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const sync = useCallback(
    async (source: MensajeroBootstrapSource, force = false): Promise<BootstrapCycleResult | null> => {
      const current = userRef.current;
      if (!enabled || !current || current.appRole !== 'MENSAJERO') {
        return null;
      }
      try {
        const result = await syncMensajeroOperationalBootstrap({
          user: current,
          source,
          force,
        });
        setNotice(result.notice);
        setLastAction(result.bootstrap?.action ?? result.snapshot.lastBootstrapAction);
        setNeedsRetryOnReconnect(result.needsRetryOnReconnect);
        return result;
      } catch (error) {
        if (__DEV__) {
          console.warn('[mensajero-bootstrap-sync-error]', error);
        }
        return null;
      }
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled) return;
    void sync('session_ready', true);
  }, [enabled, sync, user?.user_id, user?.actor_id]);

  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener('change', (nextState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;
      const wasBackground = prev === 'background' || prev === 'inactive';
      if (wasBackground && nextState === 'active') {
        void sync('foreground');
      }
    });
    return () => sub.remove();
  }, [enabled, sync]);

  return {
    bootstrapNotice: notice,
    lastBootstrapAction: lastAction,
    needsRetryOnReconnect,
    syncBootstrap: sync,
  };
}
