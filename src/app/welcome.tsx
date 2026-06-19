import { type Href, router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RutafyLogo } from '@/components/brand/RutafyLogo';
import { authScreenStyles as styles } from '@/constants/authScreenStyles';
import { Spacing } from '@/constants/theme';

export default function WelcomeScreen() {
  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.inner}>
          <View style={styles.heroCenter}>
            <RutafyLogo variant="full" iconSize={64} />
            <Text style={styles.tagline}>Logística conectada en tiempo real</Text>
          </View>

          <View style={{ gap: Spacing.three }}>
            <Pressable
              style={styles.button}
              onPress={() => router.push('/login' as Href)}>
              <Text style={styles.buttonLabel}>Iniciar sesión</Text>
            </Pressable>

            <Pressable
              style={styles.buttonOutline}
              onPress={() => router.push('/register' as Href)}>
              <Text style={styles.buttonLabelOutline}>Crear cuenta</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
