import { type Href, router } from 'expo-router';
import { Linking, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authScreenStyles as styles } from '@/constants/authScreenStyles';
import { Spacing } from '@/constants/theme';

const SUPPORT_EMAIL = 'soporte@rutafy.app';

export default function RegisterMensajeroScreen() {
  const handleRequestAccess = () => {
    void Linking.openURL(
      `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Solicitud de acceso mensajero Rutafy')}`,
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.inner}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backLabel}>← Volver</Text>
          </Pressable>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Alta de mensajero</Text>
            <Text style={styles.cardSubtitle}>
              Por ahora las cuentas de mensajero son habilitadas por el equipo Rutafy.
            </Text>
            <Text style={styles.cardSubtitle}>
              Solicita acceso y te contactaremos para activar tu cuenta operativa.
            </Text>

            <Pressable style={styles.button} onPress={handleRequestAccess}>
              <Text style={styles.buttonLabel}>Solicitar acceso</Text>
            </Pressable>

            <Pressable
              style={styles.buttonOutline}
              onPress={() => router.replace('/login' as Href)}>
              <Text style={styles.buttonLabelOutline}>Ya tengo cuenta — Iniciar sesión</Text>
            </Pressable>
          </View>

          <View style={{ marginTop: Spacing.two }}>
            <Text style={[styles.linkText, { textAlign: 'center' }]}>
              {SUPPORT_EMAIL}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
