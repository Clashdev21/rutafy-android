import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RutafyColors } from '@/constants/rutafyTheme';

const TAB_TITLES: Record<string, string> = {
  index: 'Inicio',
  actividad: 'Actividad',
  cuenta: 'Cuenta',
};

type TabRoute = {
  key: string;
  name: string;
  params?: object;
};

export type RutafyTabBarProps = {
  state: { index: number; routes: TabRoute[] };
  descriptors: Record<string, { options: { title?: string } }>;
  navigation: {
    emit: (event: { type: string; target?: string; canPreventDefault?: boolean }) => {
      defaultPrevented: boolean;
    };
    navigate: (name: string, params?: object) => void;
  };
};

export function RutafyTabBar({ state, descriptors, navigation }: RutafyTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {state.routes.map((route: TabRoute, index: number) => {
        const focused = state.index === index;
        const { options } = descriptors[route.key];
        const label =
          (typeof options.title === 'string' ? options.title : null) ??
          TAB_TITLES[route.name] ??
          route.name;

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            }}
            style={styles.tab}>
            <View style={[styles.indicator, focused && styles.indicatorFocused]} />
            <Text style={[styles.label, focused && styles.labelFocused]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: RutafyColors.border,
    backgroundColor: RutafyColors.surface,
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  indicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  indicatorFocused: {
    backgroundColor: RutafyColors.brand,
    width: 20,
    borderRadius: 2,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: RutafyColors.textSecondary,
  },
  labelFocused: {
    color: RutafyColors.brand,
    fontWeight: '700',
  },
});
