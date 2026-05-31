/** Altura aproximada de RutafyTabBar (sin safe area inferior). */
export const RUTAFY_TAB_BAR_HEIGHT = 56;

/** Espacio inferior dentro del scroll para no quedar bajo la tab bar. */
export const TAB_SCROLL_BOTTOM_PADDING = 120;

/** Padding inferior para ScrollView/FlatList dentro de tabs con tab bar custom. */
export function getTabBarScrollPadding(bottomInset: number): number {
  return bottomInset + TAB_SCROLL_BOTTOM_PADDING;
}
