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
import { useCallback, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';

import { AuthProvider } from '@/auth/AuthProvider';
import { AuthNavigationGuard } from '@/components/auth/AuthNavigationGuard';
import { RutafyBrandSplash } from '@/components/brand/RutafyBrandSplash';
import { PushNotificationsBootstrap } from '@/components/notifications/PushNotificationsBootstrap';
import { NotificationsInboxProvider } from '@/contexts/NotificationsInboxContext';
import { RutafyBrandPalette } from '@/constants/rutafyTheme';
import { colors } from '@/theme/colors';
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
    border: colors.border,
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
  const [showBrandSplash, setShowBrandSplash] = useState(true);
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  const ready = fontsLoaded || fontError;

  const hideNativeSplash = useCallback(async () => {
    if (ready) {
      await SplashScreen.hideAsync();
    }
  }, [ready]);

  useEffect(() => {
    void hideNativeSplash();
  }, [hideNativeSplash]);

  if (!ready) {
    return null;
  }

  return (
    <AuthProvider>
      <NotificationsInboxProvider>
        <ThemeProvider value={colorScheme === 'dark' ? RutafyDarkTheme : RutafyLightTheme}>
          <PushNotificationsBootstrap />
          <AuthNavigationGuard />
          <Stack screenOptions={{ headerShown: false }} />
          <RutafyBrandSplash
            visible={showBrandSplash}
            onFinish={() => setShowBrandSplash(false)}
          />
        </ThemeProvider>
      </NotificationsInboxProvider>
    </AuthProvider>
  );
}
