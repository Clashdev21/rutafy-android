import { StyleSheet, Text, View } from 'react-native';

import { RutafyHeroCard } from '@/components/rutafy/RutafyHeroCard';
import { RutafyColors } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';
import type { Service } from '@/types/service';

export type TransportistaPhase =
  | 'IDLE'
  | 'SEARCHING'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

const SEARCHING_STATUSES = new Set([
  'REQUESTED',
  'OFFERED',
  'PENDING',
  'SEARCHING',
]);

const CANCELLED_STATUSES = new Set([
  'CANCELLED_BY_TRANSPORTER',
  'CANCELLED_BY_MESSENGER',
  'EXPIRED',
  'FAILED_PICKUP',
  'FAILED_DROPOFF',
  'NO_SHOW',
]);

export function resolveTransportistaPhase(
  activeService: Service | null | undefined,
): TransportistaPhase {
  if (!activeService) return 'IDLE';

  const s = String(activeService.status ?? '')
    .trim()
    .toUpperCase();

  if (CANCELLED_STATUSES.has(s)) return 'CANCELLED';
  if (s === 'CLOSED') return 'COMPLETED';
  if (s === 'STARTED') return 'IN_PROGRESS';
  if (s === 'CLAIMED') return 'ASSIGNED';
  if (SEARCHING_STATUSES.has(s)) return 'SEARCHING';

  return 'SEARCHING';
}

type PhaseContent = {
  eyebrow: string;
  title: string;
  body: string;
};

function getPhaseContent(phase: TransportistaPhase): PhaseContent {
  switch (phase) {
    case 'IDLE':
      return {
        eyebrow: 'Listo para operar',
        title: 'Sin servicio activo',
        body: 'Solicita un servicio para comenzar.',
      };
    case 'SEARCHING':
      return {
        eyebrow: 'Solicitud enviada',
        title: 'Buscando mensajero…',
        body: 'Estamos notificando a los mensajeros disponibles.',
      };
    case 'ASSIGNED':
      return {
        eyebrow: 'Mensajero asignado',
        title: 'Servicio tomado',
        body: 'El mensajero va en camino a la recogida.',
      };
    case 'IN_PROGRESS':
      return {
        eyebrow: 'En curso',
        title: 'Servicio en ruta',
        body: 'El mensajero está realizando la entrega.',
      };
    case 'COMPLETED':
      return {
        eyebrow: 'Finalizado',
        title: 'Servicio cerrado',
        body: 'Puedes solicitar un nuevo servicio.',
      };
    case 'CANCELLED':
      return {
        eyebrow: 'Cancelado',
        title: 'Servicio no completado',
        body: 'Puedes crear una nueva solicitud.',
      };
  }
}

function RoutePanel({ service }: { service: Service }) {
  return (
    <View style={styles.routePanel}>
      <View style={styles.routeRow}>
        <Text style={styles.routeLabel}>Recoger en</Text>
        <Text style={styles.routeValue}>{service.origin}</Text>
      </View>
      <View style={styles.routeRow}>
        <Text style={styles.routeLabel}>Entregar en</Text>
        <Text style={styles.routeValue}>{service.destination}</Text>
      </View>
      <View style={[styles.routeRow, styles.routeRowLast]}>
        <Text style={styles.routeLabel}>Código</Text>
        <Text style={[styles.routeValue, styles.mono]}>{service.service_code}</Text>
      </View>
    </View>
  );
}

type Props = {
  activeService: Service | null;
};

export function TransportistaPhaseHero({ activeService }: Props) {
  const phase = resolveTransportistaPhase(activeService);
  const content = getPhaseContent(phase);
  const showRoutes = activeService && phase !== 'IDLE';

  return (
    <RutafyHeroCard>
      <Text style={styles.eyebrow}>{content.eyebrow}</Text>
      <Text style={styles.title}>{content.title}</Text>
      <Text style={styles.body}>{content.body}</Text>
      {showRoutes ? <RoutePanel service={activeService} /> : null}
    </RutafyHeroCard>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.85)',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: RutafyColors.white,
    lineHeight: 26,
  },
  body: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 20,
  },
  routePanel: {
    marginTop: Spacing.two,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: RutafyColors.heroGlassBorder,
    backgroundColor: RutafyColors.heroGlass,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  routeRow: {
    gap: 2,
    paddingBottom: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  routeRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  routeLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.7)',
  },
  routeValue: {
    fontSize: 14,
    fontWeight: '600',
    color: RutafyColors.white,
  },
  mono: {
    fontFamily: 'monospace',
  },
});
