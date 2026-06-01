import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RutafyButton } from '@/components/rutafy/RutafyButton';
import { ServiceStatusBadge } from '@/components/services/ServiceStatusBadge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { RutafyColors } from '@/constants/rutafyTheme';
import { useTransportistaServiceCancel } from '@/hooks/useTransportistaServiceCancel';
import { useTransportistaServicesContext } from '@/contexts/TransportistaServicesContext';
import { shouldShowTransportistaCancelButton } from '@/utils/transportistaCancelAction';
import { isStale, minutesAgo } from '@/utils/gpsFreshness';
import { getStatusLabel } from '@/utils/serviceStatus';

export default function TransportistaDetalleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getServiceById } = useTransportistaServicesContext();
  const service = id ? getServiceById(String(id)) : null;
  const insets = useSafeAreaInsets();
  const scrollBottom = Math.max(insets.bottom, Spacing.four) + Spacing.six;
  const showCancel = shouldShowTransportistaCancelButton(service);
  const { confirmAndCancel, isCancelling, cancelError, canOperate } =
    useTransportistaServiceCancel();

  if (!service) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText themeColor="textSecondary">
          Servicio no encontrado en la lista local. Vuelve al inicio para actualizar.
        </ThemedText>
      </ThemedView>
    );
  }

  const cancelling = isCancelling(service.service_id);
  const staleGps = isStale(service.messenger_location_updated_at);
  const distanceLabel = formatDistanceKm(service.estimated_route_distance_km);
  const etaLabel = formatEtaMinutes(service.estimated_route_duration_minutes);
  const gpsUpdated = minutesAgo(service.messenger_location_updated_at);

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: scrollBottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator>
        <View style={styles.header}>
          <ThemedText type="title">{service.service_code}</ThemedText>
          <ServiceStatusBadge status={service.status} />
        </View>

        <DetailRow label="Estado" value={getStatusLabel(service.status)} />
        <DetailRow label="Tipo" value={service.service_type} />
        <DetailRow label="Modo" value={service.request_mode} />
        <DetailRow label="Origen" value={service.origin} />
        <DetailRow label="Destino" value={service.destination} />
        {distanceLabel ? <DetailRow label="Tracking" value={`Mensajero a ${distanceLabel}`} /> : null}
        {etaLabel ? <DetailRow label="ETA" value={`ETA aprox: ${etaLabel}`} /> : null}
        {gpsUpdated ? (
          <DetailRow label="GPS" value={`Ubicación actualizada ${gpsUpdated}`} />
        ) : null}
        {staleGps ? (
          <Text style={styles.gpsWarning}>⚠ Ubicación del mensajero desactualizada</Text>
        ) : null}
        {service.created_at ? <DetailRow label="Creado" value={service.created_at} /> : null}
        {service.scheduled_for ? (
          <DetailRow label="Programado" value={service.scheduled_for} />
        ) : null}

        {showCancel ? (
          <View style={styles.cancelSection}>
            <RutafyButton
              label={cancelling ? 'Cancelando solicitud…' : 'Cancelar servicio'}
              variant="danger"
              disabled={!canOperate || cancelling}
              loading={cancelling}
              onPress={() => confirmAndCancel(service)}
            />
            {cancelError ? (
              <Text style={styles.cancelError}>{cancelError}</Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

function formatDistanceKm(value?: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const km = Number(value);
  return km < 1 ? `${Math.max(0.1, km).toFixed(1)} km` : `${km.toFixed(1)} km`;
}

function formatEtaMinutes(value?: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const minutes = Math.max(1, Math.ceil(value));
  return `${minutes} min`;
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
  cancelSection: { gap: Spacing.two, marginTop: Spacing.two },
  cancelError: {
    textAlign: 'center',
    fontSize: 13,
    color: RutafyColors.danger,
  },
  gpsWarning: {
    fontSize: 13,
    fontWeight: '600',
    color: RutafyColors.danger,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  row: { gap: Spacing.half },
});
