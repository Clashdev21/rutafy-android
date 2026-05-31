import { Tabs } from 'expo-router';

import { RutafyTabBar, type RutafyTabBarProps } from '@/components/navigation/RutafyTabBar';
import { RutafyColors } from '@/constants/rutafyTheme';

export default function TransportistaTabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <RutafyTabBar {...(props as RutafyTabBarProps)} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { flex: 1, backgroundColor: RutafyColors.surfaceMuted },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Inicio' }} />
      <Tabs.Screen name="actividad" options={{ title: 'Actividad' }} />
      <Tabs.Screen name="cuenta" options={{ title: 'Cuenta' }} />
    </Tabs>
  );
}
