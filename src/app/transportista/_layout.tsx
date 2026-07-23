import { Stack } from 'expo-router';

import { useAuth } from '@/auth/useAuth';
import { TransportistaServicesProvider } from '@/contexts/TransportistaServicesContext';
import { RutafyStackHeaderOptions } from '@/constants/rutafyTheme';

export default function TransportistaLayout() {
  const { user } = useAuth();
  const requesterCompanyId = user?.actor_id?.trim() || null;

  return (
    <TransportistaServicesProvider requesterCompanyId={requesterCompanyId}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="crear"
          options={{ title: 'Nuevo servicio', headerShown: true, ...RutafyStackHeaderOptions }}
        />
        <Stack.Screen
          name="notificaciones/index"
          options={{ title: 'Notificaciones', headerShown: false }}
        />
        <Stack.Screen
          name="notificaciones/[id]"
          options={{ title: 'Detalle', headerShown: false }}
        />
        <Stack.Screen
          name="[id]"
          options={{ title: 'Detalle', headerShown: true, ...RutafyStackHeaderOptions }}
        />
      </Stack>
    </TransportistaServicesProvider>
  );
}
