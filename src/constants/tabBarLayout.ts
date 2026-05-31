/** Altura aproximada de RutafyTabBar (sin safe area inferior). */
export const RUTAFY_TAB_BAR_HEIGHT = 56;

/** Padding inferior para ScrollView/FlatList dentro de tabs con tab bar custom. */
export function getTabBarScrollPadding(bottomInset: number, extra = 16): number {
  return bottomInset + RUTAFY_TAB_BAR_HEIGHT + extra;
}
