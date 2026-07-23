import { Stack } from 'expo-router';

import { MensajeroOperationsProvider } from '@/contexts/MensajeroOperationsContext';
import { RutafyStackHeaderOptions } from '@/constants/rutafyTheme';

export default function MensajeroLayout() {
  return (
    <MensajeroOperationsProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
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
    </MensajeroOperationsProvider>
  );
}
