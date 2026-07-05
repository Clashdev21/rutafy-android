import { Redirect, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/useAuth';
import { RutafyLogo } from '@/components/brand/RutafyLogo';
import { AppSkeleton, AppText } from '@/components/ui';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { getHomeHrefForUser } from '@/utils/roles';

export default function IndexScreen() {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <RutafyLogo variant="stack" iconSize={72} />
        <View style={styles.skeletonBlock}>
          <AppSkeleton width="60%" height={14} />
          <AppSkeleton width="40%" height={14} />
        </View>
        <AppText variant="caption">Cargando operación…</AppText>
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href={'/welcome' as Href} />;
  }

  return <Redirect href={getHomeHrefForUser(user)} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
    gap: spacing.xl,
  },
  skeletonBlock: {
    width: '100%',
    maxWidth: 240,
    gap: spacing.sm,
    alignItems: 'center',
  },
});
