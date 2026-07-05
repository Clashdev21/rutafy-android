import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '@/theme/colors';
import { radius } from '@/theme/radius';
import { duration } from '@/theme/animations';

type Props = {
  width?: number | `${number}%`;
  height?: number;
  style?: StyleProp<ViewStyle>;
  rounded?: boolean;
};

export function AppSkeleton({ width = '100%', height = 16, style, rounded }: Props) {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: duration.normal,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: duration.normal,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.base,
        rounded && styles.rounded,
        { width, height, opacity },
        style,
      ]}
    />
  );
}

export function AppSkeletonCard() {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <AppSkeleton width="45%" height={18} />
        <AppSkeleton width={72} height={24} rounded />
      </View>
      <AppSkeleton width="80%" height={14} />
      <AppSkeleton width="65%" height={14} />
      <AppSkeleton width="40%" height={36} rounded style={styles.cta} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.border,
    borderRadius: radius.input,
  },
  rounded: { borderRadius: radius.pill },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cta: { marginTop: 4 },
});
