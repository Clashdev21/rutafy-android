import { type Href, router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getServiceCode } from '@/components/mensajero/serviceDisplay';
import { RutafyButton } from '@/components/rutafy/RutafyButton';
import { ServiceStatusBadge } from '@/components/services/ServiceStatusBadge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { RutafyColors } from '@/constants/rutafyTheme';
import { useMensajeroOperationsContext } from '@/contexts/MensajeroOperationsContext';
import type { Service } from '@/types/service';
import { getStatusLabel } from '@/utils/serviceStatus';

export default function MensajeroDetalleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getServiceById, refreshAll, loadingMy, loadingOffers, availabilitySyncing } =
    useMensajeroOperationsContext();
  const service = id ? getServiceById(String(id)) : null;
  const insets = useSafeAreaInsets();
  const scrollBottom = Math.max(insets.bottom, Spacing.four) + Spacing.six;
  const busy = loadingMy || loadingOffers || availabilitySyncing;

  if (!service) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="subtitle" style={styles.notFoundTitle}>
          Servicio no encontrado
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.notFoundBody}>
          No está en la lista local. Vuelve o actualiza para sincronizar con el servidor.
        </ThemedText>
        <View style={styles.notFoundActions}>
          <RutafyButton label="Volver" variant="secondary" onPress={() => router.back()} />
          <RutafyButton
            label={busy ? 'Actualizando…' : 'Reintentar'}
            variant="primary"
            loading={busy}
            disabled={busy}
            onPress={() => void refreshAll({ silent: false, source: 'manual' })}
          />
        </View>
      </ThemedView>
    );
  }

  const showGoToOperation =
    service.status === 'CLAIMED' || service.status === 'STARTED';
  const dispatchStatus = pickDispatchStatus(service);

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: scrollBottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator>
        <View style={styles.header}>
          <ThemedText type="title">{getServiceCode(service)}</ThemedText>
          <ServiceStatusBadge status={service.status} />
        </View>

        <DetailRow label="Estado" value={getStatusLabel(service.status)} />
        {dispatchStatus ? (
          <DetailRow label="Despacho" value={dispatchStatus} />
        ) : null}
        <DetailRow label="Tipo" value={service.service_type || '—'} />
        <DetailRow label="Recoger en" value={service.origin || '—'} />
        <DetailRow label="Entregar en" value={service.destination || '—'} />
        {service.created_at ? (
          <DetailRow label="Creado" value={formatDateTime(service.created_at)} />
        ) : null}
        <DetailRow label="ID" value={service.service_id} />

        {showGoToOperation ? (
          <View style={styles.actionSection}>
            <RutafyButton
              label="Ir a operación"
              variant="primary"
              onPress={() => router.replace('/mensajero' as Href)}
            />
          </View>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

function pickDispatchStatus(service: Service): string | null {
  const meta = service.meta;
  if (!meta || typeof meta !== 'object') return null;
  const raw = (meta as Record<string, unknown>).dispatch_status;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return null;
}

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.four },
  content: { gap: Spacing.three },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  row: { gap: Spacing.half },
  actionSection: { marginTop: Spacing.two },
  notFoundTitle: { marginBottom: Spacing.two },
  notFoundBody: { marginBottom: Spacing.four },
  notFoundActions: { gap: Spacing.two },
});
