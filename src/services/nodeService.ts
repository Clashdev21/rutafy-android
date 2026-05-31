import { apiClient } from '@/api/client';
import { SERVICE_ENDPOINTS } from '@/api/endpoints';
import type { NodesListResponse, RutafyNode } from '@/types/node';
import { hasValidNodeCoords } from '@/utils/nodes';

function pickStr(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function normalizeNode(raw: unknown): RutafyNode | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;

  const node_id = pickStr(row.node_id);
  const name = pickStr(row.name);
  const lat = toFiniteNumber(row.lat);
  const lng = toFiniteNumber(row.lng);

  if (!node_id || !name || lat === null || lng === null) return null;

  return {
    node_id,
    code: pickStr(row.code) ?? node_id,
    name,
    category: pickStr(row.category) ?? '',
    zone: pickStr(row.zone),
    lat,
    lng,
    address_text: pickStr(row.address_text),
    is_active: row.is_active !== false,
    marketplace_enabled:
      typeof row.marketplace_enabled === 'boolean' ? row.marketplace_enabled : undefined,
    metadata:
      row.metadata && typeof row.metadata === 'object'
        ? (row.metadata as RutafyNode['metadata'])
        : undefined,
  };
}

export async function listActiveNodes(): Promise<RutafyNode[]> {
  const { data } = await apiClient.get<NodesListResponse>(SERVICE_ENDPOINTS.nodes, {
    params: { is_active: true },
  });

  if (data?.error) {
    throw new Error(data.error);
  }

  const rows = Array.isArray(data.nodes) ? data.nodes : [];
  return rows
    .map(normalizeNode)
    .filter((n): n is RutafyNode => n !== null && n.is_active);
}

/** Nodos listables en picker: activos y con coordenadas válidas para dispatch */
export async function listActiveNodesForPicker(): Promise<RutafyNode[]> {
  const nodes = await listActiveNodes();
  return nodes.filter(hasValidNodeCoords);
}
