import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { usePolling } from '@/hooks/usePolling';
import {
  CONTROL_POLL_INTERVAL_MS,
  fetchOperationalControlList,
} from '@/services/operationalControlService';
import type { ControlListFilter, ControlUnitCard } from '@/types/operationalControl';
import { formatBogotaDateLong } from '@/utils/bogotaDayRange';
import {
  deriveControlKpis,
  filterControlUnits,
  mapControlContainers,
} from '@/utils/controlMobileDisplay';
import { resolveControlUiError, type ControlUiError } from '@/utils/controlMobileErrors';

export function useControlToday() {
  const [units, setUnits] = useState<ControlUnitCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<ControlUiError | null>(null);
  const [focused, setFocused] = useState(false);
  const [filter, setFilter] = useState<ControlListFilter>('todos');
  const [query, setQuery] = useState('');
  const [dayLabel, setDayLabel] = useState(() => formatBogotaDateLong());
  const inFlightRef = useRef(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const silent = Boolean(opts?.silent);
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const now = new Date();
      const data = await fetchOperationalControlList({ now });
      setUnits(mapControlContainers(data));
      setDayLabel(formatBogotaDateLong(now));
      setError(null);
    } catch (e) {
      setError(resolveControlUiError(e));
    } finally {
      inFlightRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      void load();
      return () => setFocused(false);
    }, [load]),
  );

  const canPoll = focused && error?.kind !== 'forbidden';
  usePolling(() => load({ silent: true }), CONTROL_POLL_INTERVAL_MS, canPoll);

  const kpis = useMemo(() => deriveControlKpis(units), [units]);
  const visibleUnits = useMemo(
    () => filterControlUnits(units, filter, query),
    [units, filter, query],
  );

  return {
    units,
    visibleUnits,
    kpis,
    loading,
    refreshing,
    error,
    filter,
    setFilter,
    query,
    setQuery,
    dayLabel,
    reload: () => load(),
  };
}
