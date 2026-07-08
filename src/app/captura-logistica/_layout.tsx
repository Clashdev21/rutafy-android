import { Stack } from 'expo-router';

import { RutafyStackHeaderOptions } from '@/constants/rutafyTheme';

export default function CapturaLogisticaLayout() {
  return (
    <Stack screenOptions={{ headerShown: true, ...RutafyStackHeaderOptions }}>
      <Stack.Screen name="index" options={{ title: 'Captura logística' }} />
      <Stack.Screen name="historial" options={{ title: 'Historial de capturas' }} />
      <Stack.Screen
        name="[sessionId]"
        options={{ title: 'Resumen operacional' }}
      />
      <Stack.Screen name="diagnostico" options={{ title: 'Diagnóstico' }} />
    </Stack>
  );
}
