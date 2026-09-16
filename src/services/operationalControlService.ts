import { apiClient } from '@/api/client';
import { ADMIN_CONTROL_ENDPOINTS } from '@/api/endpoints';
import type { OperationalControlListResponse } from '@/types/operationalControl';
import {
  buildOperationalControlListParams,
  CONTROL_DEFAULT_PROGRAM_CODE,
  CONTROL_LIST_LIMIT,
  type ControlListQueryInput,
} from '@/utils/controlMobileQuery';

export { CONTROL_DEFAULT_PROGRAM_CODE, CONTROL_LIST_LIMIT };
export const CONTROL_POLL_INTERVAL_MS = 30_000;

export type FetchOperationalControlParams = ControlListQueryInput;

export async function fetchOperationalControlList(
  params: FetchOperationalControlParams = {},
): Promise<OperationalControlListResponse> {
  const { data } = await apiClient.get<OperationalControlListResponse>(
    ADMIN_CONTROL_ENDPOINTS.operationalControl,
    { params: buildOperationalControlListParams(params) },
  );
  return data ?? { view: 'containers', summary: null, containers: [] };
}
