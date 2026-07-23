export const AUTH_ENDPOINTS = {
  login: '/v1/auth/login',
  registerTransportista: '/v1/auth/register-transportista',
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
  heartbeat: '/v1/mensajero/heartbeat',
} as const;

export const OFFER_ENDPOINTS = {
  accept: (offerId: string) =>
    `/v1/service-offers/${encodeURIComponent(offerId)}/accept`,
} as const;

export const TRACKING_SESSION_ENDPOINTS = {
  start: '/v1/tracking-sessions/start',
  my: '/v1/tracking-sessions/my',
  byId: (sessionId: string) =>
    `/v1/tracking-sessions/${encodeURIComponent(sessionId)}`,
  pointsBatch: (sessionId: string) =>
    `/v1/tracking-sessions/${encodeURIComponent(sessionId)}/points/batch`,
  end: (sessionId: string) =>
    `/v1/tracking-sessions/${encodeURIComponent(sessionId)}/end`,
  cancel: (sessionId: string) =>
    `/v1/tracking-sessions/${encodeURIComponent(sessionId)}/cancel`,
} as const;

export const NOTIFICATION_ENDPOINTS = {
  preferences: '/v1/notifications/preferences',
  registerDevice: '/v1/notifications/devices/register',
  unregisterDevice: '/v1/notifications/devices/unregister',
  inbox: '/v1/notifications/inbox',
  inboxUnreadCount: '/v1/notifications/inbox/unread-count',
  inboxById: (id: string) => `/v1/notifications/inbox/${encodeURIComponent(id)}`,
  inboxRead: (id: string) => `/v1/notifications/inbox/${encodeURIComponent(id)}/read`,
  inboxOpened: (id: string) => `/v1/notifications/inbox/${encodeURIComponent(id)}/opened`,
  inboxReadAll: '/v1/notifications/inbox/read-all',
  inboxArchive: (id: string) => `/v1/notifications/inbox/${encodeURIComponent(id)}/archive`,
} as const;
