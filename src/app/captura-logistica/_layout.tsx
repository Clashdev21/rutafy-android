import { Stack } from 'expo-router';

import { RutafyStackHeaderOptions } from '@/constants/rutafyTheme';

export default function CapturaLogisticaLayout() {
  return (
    <Stack screenOptions={{ headerShown: true, ...RutafyStackHeaderOptions }}>
      <Stack.Screen name="index" options={{ title: 'Captura logística' }} />
    </Stack>
  );
}
