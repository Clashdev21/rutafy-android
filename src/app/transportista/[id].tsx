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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  row: { gap: Spacing.half },
});
