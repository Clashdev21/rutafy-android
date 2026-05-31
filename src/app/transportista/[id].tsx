import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ServiceStatusBadge } from '@/components/services/ServiceStatusBadge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTransportistaServicesContext } from '@/contexts/TransportistaServicesContext';
import { Spacing } from '@/constants/theme';
import { getStatusLabel } from '@/utils/serviceStatus';

export default function TransportistaDetalleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getServiceById } = useTransportistaServicesContext();
  const service = id ? getServiceById(String(id)) : null;

  if (!service) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText themeColor="textSecondary">
          Servicio no encontrado en la lista local. Vuelve al inicio para actualizar.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
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
  content: { gap: Spacing.three, paddingBottom: Spacing.six },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  row: { gap: Spacing.half },
});
