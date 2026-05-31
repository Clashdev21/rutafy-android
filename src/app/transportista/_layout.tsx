import { Stack } from 'expo-router';

import { useAuth } from '@/auth/useAuth';
import { TransportistaServicesProvider } from '@/contexts/TransportistaServicesContext';

export default function TransportistaLayout() {
  const { user } = useAuth();
  const requesterCompanyId = user?.actor_id?.trim() || null;

  return (
    <TransportistaServicesProvider requesterCompanyId={requesterCompanyId}>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="crear" options={{ title: 'Nuevo servicio', headerShown: true }} />
        <Stack.Screen name="[id]" options={{ title: 'Detalle', headerShown: true }} />
      </Stack>
    </TransportistaServicesProvider>
  );
}
