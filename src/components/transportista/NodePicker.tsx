import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { RutafyNode } from '@/types/node';
import { getNodeDisplayLabel } from '@/utils/nodes';

type NodePickerProps = {
  label: string;
  nodes: RutafyNode[];
  value: string;
  onValueChange: (nodeId: string) => void;
  disabled?: boolean;
  loading?: boolean;
};

export function NodePicker({
  label,
  nodes,
  value,
  onValueChange,
  disabled = false,
  loading = false,
}: NodePickerProps) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => nodes.find((n) => n.node_id === value) ?? null,
    [nodes, value],
  );

  const selectedLabel = selected
    ? getNodeDisplayLabel(selected)
    : loading
      ? 'Cargando nodos…'
      : 'Seleccionar nodo';

  return (
    <View style={styles.wrap}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <Pressable
        style={[styles.trigger, (disabled || loading) && styles.triggerDisabled]}
        onPress={() => !disabled && !loading && setOpen(true)}
        disabled={disabled || loading}>
        {loading ? (
          <ActivityIndicator size="small" />
        ) : (
          <ThemedText type="small" numberOfLines={2}>
            {selectedLabel}
          </ThemedText>
        )}
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <ThemedView style={styles.sheet} onStartShouldSetResponder={() => true}>
            <ThemedText type="subtitle" style={styles.sheetTitle}>
              {label}
            </ThemedText>
            <FlatList
              data={nodes}
              keyExtractor={(item) => item.node_id}
              style={styles.list}
              ListEmptyComponent={
                <ThemedText themeColor="textSecondary" style={styles.empty}>
                  No hay nodos con coordenadas válidas.
                </ThemedText>
              }
              renderItem={({ item }) => {
                const isSelected = item.node_id === value;
                return (
                  <Pressable
                    style={[styles.option, isSelected && styles.optionSelected]}
                    onPress={() => {
                      onValueChange(item.node_id);
                      setOpen(false);
                    }}>
                    <ThemedText type="smallBold">{getNodeDisplayLabel(item)}</ThemedText>
                    {item.address_text ? (
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                        {item.address_text}
                      </ThemedText>
                    ) : null}
                  </Pressable>
                );
              }}
            />
            <Pressable style={styles.closeBtn} onPress={() => setOpen(false)}>
              <ThemedText style={styles.closeLabel}>Cerrar</ThemedText>
            </Pressable>
          </ThemedView>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one },
  trigger: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    backgroundColor: '#fff',
    minHeight: 48,
    justifyContent: 'center',
  },
  triggerDisabled: { opacity: 0.6 },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    maxHeight: '70%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  sheetTitle: { textAlign: 'center' },
  list: { flexGrow: 0 },
  empty: { textAlign: 'center', padding: Spacing.four },
  option: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: Spacing.three,
    marginBottom: Spacing.two,
    gap: Spacing.half,
  },
  optionSelected: {
    borderColor: '#2A9D8F',
    backgroundColor: '#F0FDFA',
  },
  closeBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  closeLabel: { fontWeight: '600', color: '#2A9D8F' },
});
