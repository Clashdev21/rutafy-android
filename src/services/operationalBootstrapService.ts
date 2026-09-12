import axios from 'axios';

import { apiClient } from '@/api/client';
import { MESSENGER_ENDPOINTS } from '@/api/endpoints';
import type { OperationalBootstrapResponse } from '@/types/operationalBootstrap';
import { parseOperationalBootstrapResponse } from '@/utils/operationalBootstrapParse';

export async function getOperationalBootstrap(): Promise<OperationalBootstrapResponse> {
  const { data } = await apiClient.get(MESSENGER_ENDPOINTS.operationalBootstrap);
  const parsed = parseOperationalBootstrapResponse(data);
  if (!parsed) {
    throw new Error('invalid_operational_bootstrap');
  }
  return parsed;
}

export function isOperationalBootstrapIdentityFilterError(error: unknown): boolean {
  if (!axios.isAxiosError(error) || error.response?.status !== 400) return false;
  const data = error.response.data as { error?: string } | undefined;
  return data?.error === 'identity_filters_not_allowed';
}
