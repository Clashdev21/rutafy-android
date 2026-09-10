import { apiClient } from '@/api/client';
import { ADMIN_CONTROL_ENDPOINTS } from '@/api/endpoints';
import type { OperationalDigitalTwinDetail } from '@/types/operationalDigitalTwin';
import { CONTROL_DEFAULT_PROGRAM_CODE } from '@/services/operationalControlService';

export async function fetchOperationalDigitalTwin(
  containerId: string,
  programCode: string = CONTROL_DEFAULT_PROGRAM_CODE,
): Promise<OperationalDigitalTwinDetail> {
  const id = containerId.trim();
  const { data } = await apiClient.get<OperationalDigitalTwinDetail>(
    ADMIN_CONTROL_ENDPOINTS.operationalDigitalTwinContainer(id),
    {
      params: {
        program_code: programCode,
      },
    },
  );
  return data ?? {};
}
