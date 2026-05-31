export const AUTH_ENDPOINTS = {
  login: '/v1/auth/login',
  refresh: '/v1/auth/refresh',
  me: '/v1/auth/me',
  logout: '/v1/auth/logout',
} as const;

export const SERVICE_ENDPOINTS = {
  list: '/v1/services',
  my: '/v1/services/my',
  create: '/v1/services',
  close: (serviceId: string) =>
    `/v1/services/${encodeURIComponent(serviceId)}/close`,
  start: (serviceId: string) =>
    `/v1/services/${encodeURIComponent(serviceId)}/start`,
  cancel: (serviceId: string) =>
    `/v1/services/${encodeURIComponent(serviceId)}/cancel`,
  evidences: (serviceId: string) =>
    `/v1/services/${encodeURIComponent(serviceId)}/evidences`,
  nodes: '/v1/nodes',
} as const;

export const MESSENGER_ENDPOINTS = {
  activeOffers: (messengerId: string) =>
    `/v1/messengers/${encodeURIComponent(messengerId)}/offers/active`,
  availability: (messengerId: string) =>
    `/v1/messengers/${encodeURIComponent(messengerId)}/availability`,
} as const;

export const OFFER_ENDPOINTS = {
  accept: (offerId: string) =>
    `/v1/service-offers/${encodeURIComponent(offerId)}/accept`,
} as const;
