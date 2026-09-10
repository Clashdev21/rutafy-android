import { Stack } from 'expo-router';

import { ControlPresentationProvider } from '@/contexts/ControlPresentationContext';
import { RutafyStackHeaderOptions } from '@/constants/rutafyTheme';

export default function ControlLayout() {
  return (
    <ControlPresentationProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="container/[id]"
          options={{
            title: 'Unidad',
            headerShown: true,
            ...RutafyStackHeaderOptions,
          }}
        />
      </Stack>
    </ControlPresentationProvider>
  );
}
