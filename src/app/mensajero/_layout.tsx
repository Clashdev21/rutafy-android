import { Stack } from 'expo-router';

import { MensajeroOperationsProvider } from '@/contexts/MensajeroOperationsContext';
import { RutafyStackHeaderOptions } from '@/constants/rutafyTheme';

export default function MensajeroLayout() {
  return (
    <MensajeroOperationsProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="[id]"
          options={{ title: 'Detalle', headerShown: true, ...RutafyStackHeaderOptions }}
        />
      </Stack>
    </MensajeroOperationsProvider>
  );
}
