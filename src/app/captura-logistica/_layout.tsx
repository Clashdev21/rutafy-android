import { Stack } from 'expo-router';

export default function CapturaLogisticaLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="index" options={{ title: 'Captura logística' }} />
    </Stack>
  );
}
