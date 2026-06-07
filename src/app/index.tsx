import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/useAuth';
import { RutafyLogo } from '@/components/brand/RutafyLogo';
import { RutafyColors, RutafyTypography } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';
import { getHomeHrefForUser } from '@/utils/roles';

export default function IndexScreen() {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <RutafyLogo variant="full" iconSize={48} />
        <ActivityIndicator size="large" color={RutafyColors.brand} style={styles.spinner} />
        <Text style={styles.loadingText}>Cargando operación…</Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  return <Redirect href={getHomeHrefForUser(user)} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: RutafyColors.loginBackground,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  spinner: { marginTop: Spacing.two },
  loadingText: {
    fontSize: 14,
    color: RutafyColors.textSecondary,
    fontFamily: RutafyTypography.fontFamily,
  },
});
