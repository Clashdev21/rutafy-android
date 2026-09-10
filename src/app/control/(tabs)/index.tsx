import { type Href, router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ControlFilterRow, ControlKpiRow } from '@/components/control/ControlKpiRow';
import { ControlUnitCardView } from '@/components/control/ControlUnitCard';
import { AppButton, AppEmptyState, AppHeader, AppInput, AppSkeletonCard } from '@/components/ui';
import { AppIcon } from '@/components/ui/AppIcon';
import { getTabBarScrollPadding } from '@/constants/tabBarLayout';
import { useControlPresentation } from '@/contexts/ControlPresentationContext';
import { useControlToday } from '@/hooks/useControlToday';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import type { ControlListFilter, ControlUnitCard } from '@/types/operationalControl';
import { CONTROL_EMPTY_TODAY_MESSAGE } from '@/utils/controlMobileErrors';

const FILTERS: { id: ControlListFilter; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'programados', label: 'Programados' },
  { id: 'en_puerto', label: 'En puerto' },
  { id: 'en_transito', label: 'En tránsito' },
  { id: 'finalizados', label: 'Finalizados' },
  { id: 'con_novedad', label: 'Con novedad' },
];

export default function ControlHoyScreen() {
  const insets = useSafeAreaInsets();
  const { presentationMode, togglePresentationMode } = useControlPresentation();
  const {
    units,
    visibleUnits,
    kpis,
    loading,
    refreshing,
    error,
    filter,
    setFilter,
    query,
    setQuery,
    dayLabel,
    reload,
  } = useControlToday();

  const openUnit = (unit: ControlUnitCard) => {
    router.push(`/control/container/${encodeURIComponent(unit.containerId)}` as Href);
  };

  const listEmpty =
    !loading && !error && units.length === 0 ? (
      <AppEmptyState
        icon="inbox"
        title="Programación de hoy"
        description={CONTROL_EMPTY_TODAY_MESSAGE}
      />
    ) : !loading && !error && visibleUnits.length === 0 ? (
      <AppEmptyState
        icon="search"
        title="Sin coincidencias"
        description="No hay unidades para este filtro o búsqueda."
      />
    ) : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <FlatList
        data={error ? [] : visibleUnits}
        keyExtractor={(item) => item.containerId}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: getTabBarScrollPadding(insets.bottom) },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void reload()} />
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <AppHeader
              title="Programación de hoy"
              subtitle={dayLabel}
              right={
                <Pressable
                  onPress={() => void reload()}
                  accessibilityRole="button"
                  accessibilityLabel="Actualizar programación"
                  hitSlop={8}
                  style={styles.refreshBtn}>
                  <AppIcon name="refresh" size={22} color={colors.navy} />
                </Pressable>
              }
            />

            <AppButton
              label={presentationMode ? 'Salir de presentación' : 'Presentar operación'}
              variant="secondary"
              onPress={togglePresentationMode}
            />

            {error ? (
              <AppEmptyState
                icon="inbox"
                title={error.kind === 'forbidden' ? 'Sin acceso' : 'Operación'}
                description={error.message}
                actionLabel={error.kind === 'forbidden' ? undefined : 'Reintentar'}
                onAction={error.kind === 'forbidden' ? undefined : () => void reload()}
                loading={loading}
              />
            ) : loading && !units.length ? null : (
              <>
                <ControlKpiRow kpis={kpis} />
                <ControlFilterRow
                  filters={FILTERS}
                  selected={filter}
                  onSelect={(id) => setFilter(id as ControlListFilter)}
                />
                <AppInput
                  placeholder="Buscar contenedor o placa"
                  value={query}
                  onChangeText={setQuery}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
              </>
            )}

            {loading && !units.length && !error ? (
              <View style={styles.skeletons}>
                <AppSkeletonCard />
                <AppSkeletonCard />
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <ControlUnitCardView
            unit={item}
            presentationMode={presentationMode}
            onPress={() => openUnit(item)}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListEmptyComponent={error || loading ? null : listEmpty}
        keyboardShouldPersistTaps="handled"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
  },
  content: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    gap: spacing.md,
  },
  headerBlock: {
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  refreshBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeletons: {
    gap: spacing.md,
  },
  sep: {
    height: spacing.sm,
  },
});
