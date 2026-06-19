import { type Href, router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authScreenStyles as styles } from '@/constants/authScreenStyles';
import { Spacing } from '@/constants/theme';

export default function RegisterRoleScreen() {
  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.inner}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backLabel}>← Volver</Text>
          </Pressable>

          <View style={styles.hero}>
            <Text style={styles.cardTitle}>Crear cuenta</Text>
            <Text style={styles.cardSubtitle}>Elige el tipo de cuenta operativa</Text>
          </View>

          <View style={{ gap: Spacing.three }}>
            <Pressable
              style={styles.roleCard}
              onPress={() => router.push('/register/mensajero' as Href)}>
              <Text style={styles.roleTitle}>Soy mensajero</Text>
              <Text style={styles.roleDescription}>
                Acepta y realiza servicios de entrega en campo.
              </Text>
            </Pressable>

            <Pressable
              style={styles.roleCard}
              onPress={() => router.push('/register/transportista' as Href)}>
              <Text style={styles.roleTitle}>Soy transportista</Text>
              <Text style={styles.roleDescription}>
                Solicita servicios de mensajería y gestiona tu operación logística.
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
