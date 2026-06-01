import { File } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';

import { API_BASE_URL } from '@/config/env';
import { tokenStorage } from '@/auth/tokenStorage';
import { SERVICE_ENDPOINTS } from '@/api/endpoints';
import { buildTraceId } from '@/utils/traceId';

const MAX_EVIDENCE_BYTES = 12 * 1024 * 1024;

export type EvidenceImageAsset = {
  uri: string;
  fileName: string;
  mimeType: string;
  fileSize: number | null;
};

export function validateEvidenceAsset(asset: EvidenceImageAsset): string | null {
  if (!asset.uri?.trim()) {
    return 'No se pudo leer la imagen seleccionada.';
  }
  const type = String(asset.mimeType ?? '').trim().toLowerCase();
  if (type && !type.startsWith('image/')) {
    return 'Solo se permiten imágenes. Elige un archivo de imagen válido.';
  }
  if (asset.fileSize != null) {
    if (asset.fileSize <= 0) {
      return 'El archivo está vacío. Vuelve a tomar o elegir la foto.';
    }
    if (asset.fileSize > MAX_EVIDENCE_BYTES) {
      return 'La imagen es demasiado grande. Máximo 12 MB.';
    }
  }
  return null;
}

function parseUploadErrorMessage(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const row = body as Record<string, unknown>;
    const msg = row.error ?? row.message ?? row.detail;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
  }
  if (status === 401) return 'Sesión expirada. Inicia sesión de nuevo.';
  if (status === 413) return 'La imagen es demasiado grande para el servidor.';
  return 'No se pudo subir la evidencia';
}

export async function uploadServiceEvidence(params: {
  serviceId: string;
  actorId: string;
  asset: EvidenceImageAsset;
}): Promise<void> {
  try {
    const validation = validateEvidenceAsset(params.asset);
    if (validation) throw new Error(validation);

    const token = await tokenStorage.getAccessToken();
    if (!token) {
      throw new Error('Sesión expirada. Inicia sesión de nuevo.');
    }

    console.log('[evidence-asset]', params.asset);

    const fileName =
      params.asset.fileName || `evidence-${Date.now()}.jpg`;
    const mimeType = params.asset.mimeType || 'image/jpeg';

    const file = new File(params.asset.uri);

    const traceId = buildTraceId('evidence');
    const formData = new FormData();
    formData.append('actor_role', 'mensajero');
    formData.append('actor_id', params.actorId);
    formData.append('kind', 'ENTREGA_DOCUMENTO');
    formData.append('taken_at_client', new Date().toISOString());
    formData.append('file', file);

    const url = `${API_BASE_URL}${SERVICE_ENDPOINTS.evidences(params.serviceId)}`;

    console.log('[evidence-upload]', {
      serviceId: params.serviceId,
      actorId: params.actorId,
      uri: params.asset.uri,
      type: mimeType,
      size: params.asset.fileSize,
      fileName,
    });

    const response = await expoFetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-trace-id': traceId,
      },
      body: formData,
    });

    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        parsed = { message: text };
      }
    }

    console.log('[evidence-response]', parsed);

    if (!response.ok) {
      throw new Error(parseUploadErrorMessage(response.status, parsed));
    }

    if (parsed && typeof parsed === 'object' && 'error' in (parsed as object)) {
      const err = (parsed as { error?: string }).error;
      if (err) throw new Error(err);
    }
  } catch (error) {
    console.log('[evidence-error]', error);
    throw error;
  }
}
