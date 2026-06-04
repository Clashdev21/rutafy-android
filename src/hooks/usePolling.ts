import { useEffect, useRef } from 'react';

export function usePolling(
  callback: () => void | Promise<void>,
  intervalMs: number,
  enabled: boolean,
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;

    if (__DEV__) {
      console.log('[polling-effect]', { intervalMs, enabled });
    }

    const tick = () => {
      if (__DEV__) {
        console.log('[polling-tick]', { intervalMs, enabled, at: Date.now() });
      }
      void callbackRef.current();
    };

    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
}
