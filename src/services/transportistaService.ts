import { apiClient } from '@/api/client';
import { SERVICE_ENDPOINTS } from '@/api/endpoints';
import type {
  CreateServiceMinimalPayload,
  CreateServiceResponse,
  ServicesListResponse,
} from '@/types/service';
import { normalizeServicesList } from '@/utils/normalizeService';

export async function listServices(requesterCompanyId: string, limit = 100) {
  const { data } = await apiClient.get<ServicesListResponse>(SERVICE_ENDPOINTS.list, {
    params: {
      requester_company_id: requesterCompanyId,
      limit,
    },
  });

  if (data?.error) {
    throw new Error(data.error);
  }

  return normalizeServicesList(data);
}

export async function createServiceMinimal(payload: CreateServiceMinimalPayload) {
  const { data } = await apiClient.post<CreateServiceResponse>(
    SERVICE_ENDPOINTS.create,
    payload,
  );

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}
