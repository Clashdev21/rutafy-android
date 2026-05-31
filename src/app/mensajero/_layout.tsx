import { Stack } from 'expo-router';

import { useAuth } from '@/auth/useAuth';
import { MensajeroOperationsProvider } from '@/contexts/MensajeroOperationsContext';

export default function MensajeroLayout() {
  const { user } = useAuth();
  const actorId = user?.actor_id?.trim() ?? null;

  return (
    <MensajeroOperationsProvider actorId={actorId}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </MensajeroOperationsProvider>
  );
}
