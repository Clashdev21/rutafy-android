import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/auth/useAuth';
import { NodePicker } from '@/components/transportista/NodePicker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTransportistaServicesContext } from '@/contexts/TransportistaServicesContext';
import { Spacing } from '@/constants/theme';
import { listActiveNodesForPicker } from '@/services/nodeService';
import * as transportistaService from '@/services/transportistaService';
import type { RutafyNode } from '@/types/node';
import { getApiErrorMessage } from '@/utils/errors';
import { buildCreateServicePayloadFromNodes, hasValidNodeCoords } from '@/utils/nodes';

export default function TransportistaCrearScreen() {
  const { user } = useAuth();
  const { refresh } = useTransportistaServicesContext();

  const [nodes, setNodes] = useState<RutafyNode[]>([]);
  const [loadingNodes, setLoadingNodes] = useState(true);
  const [originNodeId, setOriginNodeId] = useState('');
  const [destinationNodeId, setDestinationNodeId] = useState('');
  const [nodeReference, setNodeReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const companyId = user?.actor_id?.trim() ?? '';

  const originNode = useMemo(
    () => nodes.find((n) => n.node_id === originNodeId) ?? null,
    [nodes, originNodeId],
  );

  const destinationNode = useMemo(
    () => nodes.find((n) => n.node_id === destinationNodeId) ?? null,
    [nodes, destinationNodeId],
  );

  const coordsValid =
    hasValidNodeCoords(originNode) && hasValidNodeCoords(destinationNode);

  const canSubmit =
    Boolean(companyId) &&
    Boolean(originNodeId) &&
    Boolean(destinationNodeId) &&
    originNodeId !== destinationNodeId &&
    coordsValid &&
    !submitting &&
    !loadingNodes;

  const loadNodes = useCallback(async () => {
    setLoadingNodes(true);
    setError(null);
    try {
      const list = await listActiveNodesForPicker();
      setNodes(list);
    } catch (e) {
      setError(getApiErrorMessage(e, 'No fue posible cargar nodos'));
      setNodes([]);
    } finally {
      setLoadingNodes(false);
    }
  }, []);

  useEffect(() => {
    void loadNodes();
  }, [loadNodes]);

  const handleCreate = async () => {
    if (!companyId) {
      setError('No hay actor_id en la sesión para crear servicios.');
      return;
    }
    if (!originNodeId) {
      setError('Debes seleccionar un nodo de origen.');
      return;
    }
    if (!destinationNodeId) {
      setError('Debes seleccionar un nodo de destino.');
      return;
    }
    if (originNodeId === destinationNodeId) {
      setError('La recogida y la entrega no pueden ser el mismo nodo.');
      return;
    }
    if (!originNode || !destinationNode) {
      setError('Selecciona nodos válidos de la lista.');
      return;
    }
    if (!hasValidNodeCoords(originNode)) {
      setError('El nodo de origen no tiene coordenadas válidas (lat/lng).');
      return;
    }
    if (!hasValidNodeCoords(destinationNode)) {
      setError('El nodo de destino no tiene coordenadas válidas (lat/lng).');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const payload = buildCreateServicePayloadFromNodes({
        requester_company_id: companyId,
        originNode,
        destinationNode,
        nodeReference,
      });
      await transportistaService.createService(payload);
      await refresh();
      router.back();
    } catch (e) {
      setError(getApiErrorMessage(e, 'No se pudo crear el servicio'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <ThemedText type="small" themeColor="textSecondary">
            Servicio inmediato (NOW) · tipo DOCS · nodos logísticos
          </ThemedText>

          <View style={styles.section}>
            <ThemedText type="subtitle">Recoger en</ThemedText>
            <NodePicker
              label="Nodo de origen"
              nodes={nodes}
              value={originNodeId}
              onValueChange={setOriginNodeId}
              disabled={submitting}
              loading={loadingNodes}
            />
          </View>

          <View style={styles.section}>
            <ThemedText type="subtitle">Entregar en</ThemedText>
            <NodePicker
              label="Nodo de destino"
              nodes={nodes}
              value={destinationNodeId}
              onValueChange={setDestinationNodeId}
              disabled={submitting}
              loading={loadingNodes}
            />
          </View>

          <View style={styles.section}>
            <ThemedText type="smallBold">Referencia dentro del nodo (opcional)</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="Ej: Local 203, torre B"
              placeholderTextColor="#94A3B8"
              value={nodeReference}
              onChangeText={setNodeReference}
              editable={!submitting}
            />
          </View>

          {!loadingNodes && nodes.length === 0 ? (
            <ThemedText style={styles.warn}>
              No hay nodos activos con coordenadas. No se puede crear el servicio hasta que el
              backend exponga nodos con lat/lng.
            </ThemedText>
          ) : null}

          {error ? (
            <ThemedText themeColor="textSecondary" style={styles.error}>
              {error}
            </ThemedText>
          ) : null}

          <Pressable
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
            onPress={() => void handleCreate()}
            disabled={!canSubmit}>
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.buttonLabel}>Crear servicio</ThemedText>
            )}
          </Pressable>

          <Pressable style={styles.retryBtn} onPress={() => void loadNodes()} disabled={loadingNodes}>
            <ThemedText type="small" themeColor="textSecondary">
              Recargar nodos
            </ThemedText>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  form: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  section: { gap: Spacing.two },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#0F172A',
  },
  warn: { color: '#B45309', textAlign: 'center' },
  error: { textAlign: 'center' },
  button: {
    backgroundColor: '#2A9D8F',
    borderRadius: 12,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonLabel: { color: '#fff', fontWeight: '600' },
  retryBtn: { alignItems: 'center', paddingVertical: Spacing.two },
});
