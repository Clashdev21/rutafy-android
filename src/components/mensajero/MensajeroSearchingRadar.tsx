import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { RutafyColors } from '@/constants/rutafyTheme';

const RING_SIZE = 120;

export function MensajeroSearchingRadar() {
  const ring1 = useSharedValue(0.35);
  const ring2 = useSharedValue(0.35);
  const ring3 = useSharedValue(0.35);
  const opacity1 = useSharedValue(0.55);
  const opacity2 = useSharedValue(0.4);
  const opacity3 = useSharedValue(0.3);

  useEffect(() => {
    const expand = (delay: number) =>
      withDelay(
        delay,
        withRepeat(
          withTiming(1, { duration: 2400, easing: Easing.out(Easing.quad) }),
          -1,
          false,
        ),
      );
    const fade = (delay: number) =>
      withDelay(
        delay,
        withRepeat(
          withTiming(0, { duration: 2400, easing: Easing.out(Easing.quad) }),
          -1,
          false,
        ),
      );

    ring1.value = expand(0);
    opacity1.value = fade(0);
    ring2.value = expand(800);
    opacity2.value = fade(800);
    ring3.value = expand(1600);
    opacity3.value = fade(1600);
  }, [opacity1, opacity2, opacity3, ring1, ring2, ring3]);

  const style1 = useAnimatedStyle(() => ({
    transform: [{ scale: ring1.value }],
    opacity: opacity1.value,
  }));
  const style2 = useAnimatedStyle(() => ({
    transform: [{ scale: ring2.value }],
    opacity: opacity2.value,
  }));
  const style3 = useAnimatedStyle(() => ({
    transform: [{ scale: ring3.value }],
    opacity: opacity3.value,
  }));

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.ring, style1]} />
      <Animated.View style={[styles.ring, style2]} />
      <Animated.View style={[styles.ring, style3]} />
      <View style={styles.core}>
        <View style={styles.coreInner} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 2,
    borderColor: RutafyColors.brand,
    backgroundColor: RutafyColors.brandTint,
  },
  core: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: RutafyColors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: RutafyColors.brand,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  coreInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: RutafyColors.white,
  },
});
