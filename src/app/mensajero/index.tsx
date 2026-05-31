import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/useAuth';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export default function MensajeroHomeScreen() {
  const { user, logout, isLoading } = useAuth();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <ThemedText type="title">Mensajero</ThemedText>
        <ThemedText type="subtitle" style={styles.subtitle}>
          {user?.name ?? user?.phone ?? 'Sesión activa'}
        </ThemedText>
        <Pressable
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={() => void logout()}
          disabled={isLoading}>
          <ThemedText style={styles.buttonLabel}>Cerrar sesión</ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1, padding: Spacing.four, gap: Spacing.three },
  subtitle: { marginBottom: Spacing.four },
  button: {
    alignSelf: 'flex-start',
    backgroundColor: '#2A9D8F',
    borderRadius: 12,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonLabel: { color: '#fff', fontWeight: '600' },
});
