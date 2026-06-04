import { Stack } from 'expo-router';

import { MensajeroOperationsProvider } from '@/contexts/MensajeroOperationsContext';

export default function MensajeroLayout() {
  return (
    <MensajeroOperationsProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="[id]" options={{ title: 'Detalle', headerShown: true }} />
      </Stack>
    </MensajeroOperationsProvider>
  );
}
