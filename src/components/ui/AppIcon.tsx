import { SymbolView } from 'expo-symbols';
import { type ColorValue, StyleSheet, View } from 'react-native';

import { colors } from '@/theme/colors';

export type AppIconName =
  | 'home'
  | 'history'
  | 'person'
  | 'refresh'
  | 'local_shipping'
  | 'map'
  | 'inbox'
  | 'route'
  | 'schedule'
  | 'distance'
  | 'chevron_right'
  | 'close'
  | 'search';

const ICON_MAP: Record<AppIconName, { android: string; ios: string }> = {
  home: { android: 'home', ios: 'house.fill' },
  history: { android: 'history', ios: 'clock.fill' },
  person: { android: 'person', ios: 'person.fill' },
  refresh: { android: 'refresh', ios: 'arrow.clockwise' },
  local_shipping: { android: 'local_shipping', ios: 'shippingbox.fill' },
  map: { android: 'map', ios: 'map.fill' },
  inbox: { android: 'inbox', ios: 'tray.fill' },
  route: { android: 'route', ios: 'point.topleft.down.to.point.bottomright.curvepath.fill' },
  schedule: { android: 'schedule', ios: 'clock.fill' },
  distance: { android: 'straighten', ios: 'ruler.fill' },
  chevron_right: { android: 'chevron_right', ios: 'chevron.right' },
  close: { android: 'close', ios: 'xmark' },
  search: { android: 'search', ios: 'magnifyingglass' },
};

type Props = {
  name: AppIconName;
  size?: number;
  color?: ColorValue;
};

export function AppIcon({ name, size = 24, color = colors.subtitle }: Props) {
  const mapping = ICON_MAP[name];

  return (
    <View style={styles.wrap}>
      <SymbolView
        name={{
          ios: mapping.ios as never,
          android: mapping.android as never,
          web: mapping.android as never,
        }}
        size={size}
        tintColor={color}
        resizeMode="scaleAspectFit"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
});
