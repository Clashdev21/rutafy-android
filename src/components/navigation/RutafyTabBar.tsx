import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon, type AppIconName } from '@/components/ui/AppIcon';
import { colors } from '@/theme/colors';
import { fontFamily } from '@/theme/typography';

const TAB_CONFIG: Record<string, { title: string; icon: AppIconName }> = {
  index: { title: 'Inicio', icon: 'home' },
  actividad: { title: 'Actividad', icon: 'history' },
  cuenta: { title: 'Cuenta', icon: 'person' },
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
    <View
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}
      pointerEvents="box-none"
      accessibilityRole="tablist">
      {state.routes.map((route: TabRoute, index: number) => {
        const focused = state.index === index;
        const { options } = descriptors[route.key];
        const config = TAB_CONFIG[route.name] ?? { title: route.name, icon: 'home' as AppIconName };
        const label =
          (typeof options.title === 'string' ? options.title : null) ?? config.title;

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
            style={styles.tab}
            pointerEvents="auto">
            <AppIcon
              name={config.icon}
              size={22}
              color={focused ? colors.primary : colors.subtitle}
            />
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
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: 4,
  },
  indicator: {
    width: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  indicatorFocused: {
    width: 24,
    backgroundColor: colors.primary,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.subtitle,
    fontFamily: fontFamily.medium,
  },
  labelFocused: {
    color: colors.primary,
    fontWeight: '700',
    fontFamily: fontFamily.bold,
  },
});
