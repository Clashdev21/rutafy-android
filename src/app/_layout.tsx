import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AuthProvider } from '@/auth/AuthProvider';
import { AuthNavigationGuard } from '@/components/auth/AuthNavigationGuard';
import { RutafyBrandPalette } from '@/constants/rutafyTheme';
import '@/services/backgroundLocationTask';
import '@/services/operatorTrackingTask';

SplashScreen.preventAutoHideAsync();

const RutafyLightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: RutafyBrandPalette.greenPrimary,
    background: RutafyBrandPalette.backgroundLight,
    card: RutafyBrandPalette.white,
    text: RutafyBrandPalette.grayDark,
    border: '#E2E8F0',
  },
};

const RutafyDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: RutafyBrandPalette.greenPrimary,
    background: '#111827',
    card: RutafyBrandPalette.grayDark,
    text: '#F8FAFC',
  },
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? RutafyDarkTheme : RutafyLightTheme}>
        <AuthNavigationGuard />
        <Stack screenOptions={{ headerShown: false }} />
      </ThemeProvider>
    </AuthProvider>
  );
}
