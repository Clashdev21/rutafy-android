import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { useAuth } from '@/auth/useAuth';
import { ThemedView } from '@/components/themed-view';
import { getHomeHrefForUser } from '@/utils/roles';

export default function IndexScreen() {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <ThemedView style={styles.loading}>
        <ActivityIndicator size="large" />
      </ThemedView>
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
  },
});
