import type { RutafyNode } from '@/types/node';
import type { CreateServicePayload } from '@/types/service';

export function getNodeDisplayLabel(node: RutafyNode): string {
  const extras = [node.zone, node.category].filter(Boolean).join(' · ');
  return extras ? `${node.name} (${extras})` : node.name;
}

export function hasValidNodeCoords(node: RutafyNode | null | undefined): boolean {
  if (!node) return false;
  return Number.isFinite(node.lat) && Number.isFinite(node.lng);
}

/**
 * Paridad con TransportistaPanel.buildPayload() para modo NODE, sin GPS
 * (deviceOriginCoords = null → origin_lat/lng del nodo origen).
 */
export function buildCreateServicePayloadFromNodes(params: {
  requester_company_id: string;
  originNode: RutafyNode;
  destinationNode: RutafyNode;
  nodeReference?: string;
}): CreateServicePayload {
  const nodeReferenceTrimmed = params.nodeReference?.trim() ?? '';
  const finalOrigin = params.originNode.name.trim();
  const finalDestination = params.destinationNode.name.trim();

  if (!finalOrigin || !finalDestination) {
    throw new Error('Debes definir puntos de recogida y entrega.');
  }

  if (!hasValidNodeCoords(params.originNode)) {
    throw new Error('El nodo de origen no tiene coordenadas válidas (lat/lng).');
  }

  if (!hasValidNodeCoords(params.destinationNode)) {
    throw new Error('El nodo de destino no tiene coordenadas válidas (lat/lng).');
  }

  if (params.originNode.node_id === params.destinationNode.node_id) {
    throw new Error('La recogida y la entrega no pueden ser el mismo nodo.');
  }

  if (finalOrigin.toLowerCase() === finalDestination.toLowerCase()) {
    throw new Error('La recogida y la entrega no pueden ser iguales.');
  }

  const payload: CreateServicePayload = {
    requester_company_id: params.requester_company_id,
    service_type: 'DOCS',
    request_mode: 'NOW',
    origin: finalOrigin,
    destination: finalDestination,
    origin_node_id: params.originNode.node_id,
    destination_node_id: params.destinationNode.node_id,
    origin_lat: params.originNode.lat,
    origin_lng: params.originNode.lng,
    destination_lat: params.destinationNode.lat,
    destination_lng: params.destinationNode.lng,
  };

  if (nodeReferenceTrimmed !== '') {
    payload.origin_sub_location = nodeReferenceTrimmed;
    payload.operational_instructions = `Referencia dentro del nodo: ${nodeReferenceTrimmed}`;
    payload.meta = { node_reference: nodeReferenceTrimmed };
  }

  return payload;
}
