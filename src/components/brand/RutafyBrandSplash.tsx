import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { brandImages } from '@/constants/brandAssets';
import { colors } from '@/theme/colors';
import { duration } from '@/theme/animations';

type Props = {
  visible: boolean;
  onFinish?: () => void;
};

/** Splash de marca con fade 350ms — solo assets oficiales. */
export function RutafyBrandSplash({ visible, onFinish }: Props) {
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      return;
    }

    opacity.setValue(1);
    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: duration.slow,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onFinish?.();
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [visible, opacity, onFinish]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.overlay, { opacity }]} pointerEvents="none">
      <View style={styles.content}>
        <Image
          source={brandImages.splash}
          style={styles.splashImage}
          contentFit="contain"
          accessibilityLabel="Rutafy"
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  splashImage: {
    width: 280,
    height: 240,
  },
});
