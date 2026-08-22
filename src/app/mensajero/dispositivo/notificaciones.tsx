import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PushDiagnosticsPanel } from '@/components/notifications/PushDiagnosticsPanel';
import { AppHeader, AppText } from '@/components/ui';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

export default function MensajeroDispositivoNotificacionesScreen() {
  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <AppHeader
          title="Notificaciones push"
          subtitle="Registro del dispositivo"
          right={
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Volver"
              hitSlop={8}
              style={styles.headerBtn}>
              <AppText variant="bodyMedium" color={colors.primary}>
                Volver
              </AppText>
            </Pressable>
          }
        />
        <ScrollView contentContainerStyle={styles.content}>
          <PushDiagnosticsPanel />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  content: { paddingBottom: spacing['3xl'] },
  headerBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xs },
});
