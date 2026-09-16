import { BOGOTA_TIME_ZONE, formatBogotaDayParam } from './bogotaDayRange.ts';

export const CONTROL_DEFAULT_PROGRAM_CODE = 'MABE_CO';
export const CONTROL_LIST_LIMIT = 100;

export type ControlListQueryInput = {
  programCode?: string;
  limit?: number;
  now?: Date;
};

/**
 * Contrato temporal moderno de GET /v1/admin/operational-control.
 * temporal_mode=day + day + timezone reemplazan from/to: el path legacy podía
 * resolver plate/driver_name contra el messenger vinculado en vez de la
 * declaración autoritativa del Journey.
 */
export type ControlListQueryParams = {
  view: 'containers';
  program_code: string;
  temporal_mode: 'day';
  day: string;
  timezone: string;
  limit: number;
};

export function buildOperationalControlListParams(
  input: ControlListQueryInput = {},
): ControlListQueryParams {
  return {
    view: 'containers',
    program_code: input.programCode ?? CONTROL_DEFAULT_PROGRAM_CODE,
    temporal_mode: 'day',
    day: formatBogotaDayParam(input.now ?? new Date()),
    timezone: BOGOTA_TIME_ZONE,
    limit: input.limit ?? CONTROL_LIST_LIMIT,
  };
}
