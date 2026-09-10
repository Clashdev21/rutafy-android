import { apiClient } from '@/api/client';
import { ADMIN_CONTROL_ENDPOINTS } from '@/api/endpoints';
import type { OperationalControlListResponse } from '@/types/operationalControl';
import { getBogotaDayRangeUtc } from '@/utils/bogotaDayRange';

export const CONTROL_DEFAULT_PROGRAM_CODE = 'MABE_CO';
export const CONTROL_LIST_LIMIT = 100;
export const CONTROL_POLL_INTERVAL_MS = 30_000;

export type FetchOperationalControlParams = {
  from?: string;
  to?: string;
  programCode?: string;
  limit?: number;
  now?: Date;
};

export async function fetchOperationalControlList(
  params: FetchOperationalControlParams = {},
): Promise<OperationalControlListResponse> {
  const range = getBogotaDayRangeUtc(params.now ?? new Date());
  const { data } = await apiClient.get<OperationalControlListResponse>(
    ADMIN_CONTROL_ENDPOINTS.operationalControl,
    {
      params: {
        view: 'containers',
        program_code: params.programCode ?? CONTROL_DEFAULT_PROGRAM_CODE,
        from: params.from ?? range.from,
        to: params.to ?? range.to,
        limit: params.limit ?? CONTROL_LIST_LIMIT,
      },
    },
  );
  return data ?? { view: 'containers', summary: null, containers: [] };
}
