import type { ReactNode } from 'react';
import { Dimensions, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { TAB_SCROLL_BOTTOM_PADDING } from '@/constants/tabBarLayout';
import { RutafyColors } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';

type TabScrollScreenProps = {
  children: ReactNode;
};

/**
 * Scroll vertical dentro de tabs: altura acotada (flex:1) + contenido más alto que la ventana.
 * Evita gap en contentContainerStyle (Android a veces no mide bien el alto del scroll).
 */
export function TabScrollScreen({ children }: TabScrollScreenProps) {
  const insets = useSafeAreaInsets();
  const paddingBottom = insets.bottom + TAB_SCROLL_BOTTOM_PADDING;
  const minContentHeight = Dimensions.get('window').height;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom, minHeight: minContentHeight },
        ]}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        scrollEnabled
        showsVerticalScrollIndicator
        bounces>
        <View style={styles.inner}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: RutafyColors.surfaceMuted,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
  },
  inner: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    gap: Spacing.three,
  },
});
