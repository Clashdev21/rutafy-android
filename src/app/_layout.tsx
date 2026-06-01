import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import { AuthProvider } from '@/auth/AuthProvider';
import { AuthNavigationGuard } from '@/components/auth/AuthNavigationGuard';
import '@/services/backgroundLocationTask';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthNavigationGuard />
        <Stack screenOptions={{ headerShown: false }} />
      </ThemeProvider>
    </AuthProvider>
  );
}
