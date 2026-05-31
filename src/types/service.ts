export type ServiceStatus =
  | 'REQUESTED'
  | 'OFFERED'
  | 'CLAIMED'
  | 'STARTED'
  | 'CLOSED'
  | 'EXPIRED'
  | 'CANCELLED_BY_TRANSPORTER'
  | 'CANCELLED_BY_MESSENGER'
  | 'FAILED_PICKUP'
  | 'FAILED_DROPOFF'
  | 'NO_SHOW'
  | 'PENDING'
  | 'SEARCHING';

export type Service = {
  service_id: string;
  status: ServiceStatus;
  service_type: string;
  requester_company_id: string;
  mensajero_id?: string | null;
  origin: string;
  destination: string;
  service_code: string;
  request_mode: 'NOW' | 'SCHEDULED';
  scheduled_for?: string | null;
  created_at?: string;
  updated_at?: string;
  expires_at?: string | null;
  meta?: Record<string, unknown> | null;
};

export type CreateServiceMinimalPayload = {
  requester_company_id: string;
  service_type: string;
  request_mode: 'NOW';
  origin: string;
  destination: string;
};

export type ServicesListResponse = {
  services?: unknown[];
  data?: unknown[];
  error?: string;
};

export type MyServicesResponse = {
  services?: unknown[];
  error?: string;
};

export type CreateServiceResponse = {
  id?: string;
  service_id?: string;
  serviceId?: string;
  service_code?: string;
  serviceCode?: string;
  code?: string;
  error?: string;
  message?: string;
};
