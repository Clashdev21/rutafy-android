import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RutafyCard } from '@/components/rutafy/RutafyCard';
import { RutafyColors } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';
import { operatorTrackingHealthStorage } from '@/storage/operatorTrackingHealthStorage';
import type { OperatorTrackingHealth } from '@/types/operatorTrackingHealth';
import { inspectOperatorTrackingHealth } from '@/utils/operatorTrackingHealthAudit';

function formatHealthTime(iso: string | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleTimeString();
}

function formatHealthError(value: string | undefined): string {
  if (!value?.trim()) return 'ninguno';
  return value.trim();
}

type Props = {
  refreshKey?: number;
};

export function OperatorTrackingHealthPanel({ refreshKey = 0 }: Props) {
  const [health, setHealth] = useState<OperatorTrackingHealth | null>(null);
  const [lastDropReason, setLastDropReason] = useState<string | undefined>();

  const refresh = useCallback(async () => {
    const [snapshot, stored] = await Promise.all([
      inspectOperatorTrackingHealth(),
      operatorTrackingHealthStorage.get(),
    ]);
    setHealth(snapshot);
    setLastDropReason(stored.lastOperatorBgDropReason);
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 5000);
    return () => clearInterval(id);
  }, [refresh, refreshKey]);

  if (!health) return null;

  return (
    <RutafyCard style={styles.card}>
      <Text style={styles.title}>Diagnóstico BG (DEV)</Text>
      <Text style={styles.line}>
        Estado BG: {health.started ? 'FGS activo' : 'FGS inactivo'}
      </Text>
      <Text style={styles.line}>Último evento: {formatHealthTime(health.lastEventAt)}</Text>
      <Text style={styles.line}>Último batch OK: {formatHealthTime(health.lastBatchOkAt)}</Text>
      <Text style={styles.line}>
        Último batch error: {formatHealthTime(health.lastBatchErrorAt)}
      </Text>
      <Text style={styles.line}>Último error: {formatHealthError(health.lastError)}</Text>
      <Text style={styles.line}>
        Último drop: {formatHealthError(lastDropReason)}
      </Text>
    </RutafyCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.one },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: RutafyColors.navy,
  },
  line: {
    fontSize: 13,
    color: RutafyColors.textSecondary,
    fontFamily: 'monospace',
  },
});
