# Integración API

Contrato entre Rutafy Android y el backend REST.

---

## Configuración

```typescript
// src/config/env.ts
EXPO_PUBLIC_API_URL  // default: https://api.rutafy.app
```

Variable pública Expo — **no colocar secretos aquí**.

---

## Cliente HTTP

`src/api/client.ts` — instancia axios con:

| Feature | Comportamiento |
|---------|----------------|
| Base URL | `API_BASE_URL` |
| Timeout | 15s |
| Auth header | Bearer desde SecureStore |
| 401 retry | Refresh token singleton, reintento request |
| Red transitoria | No logout automático |
| 401 auth inválido | Limpia sesión + evento `sessionExpired` |

Rutas públicas (sin refresh en 401): login, register-transportista, refresh, logout.

Login usa `fetch` directo en `authService.ts` para evitar interceptors circulares.

---

## Catálogo de endpoints

Definidos en `src/api/endpoints.ts`:

### Auth

| Método | Path |
|--------|------|
| POST | `/v1/auth/login` |
| POST | `/v1/auth/register-transportista` |
| POST | `/v1/auth/refresh` |
| GET | `/v1/auth/me` |
| POST | `/v1/auth/logout` |

### Servicios

| Método | Path |
|--------|------|
| GET/POST | `/v1/services` |
| GET | `/v1/services/my` |
| POST | `/v1/services/:id/close` |
| POST | `/v1/services/:id/start` |
| POST | `/v1/services/:id/cancel` |
| GET/POST | `/v1/services/:id/evidences` |
| GET | `/v1/nodes` |

### Mensajero

| Método | Path |
|--------|------|
| GET | `/v1/messengers/:id/offers/active` |
| PATCH | `/v1/messengers/:id/availability` |
| POST | `/v1/mensajero/heartbeat` |

### Ofertas

| Método | Path |
|--------|------|
| POST | `/v1/service-offers/:id/accept` |

### Tracking sessions

| Método | Path |
|--------|------|
| POST | `/v1/tracking-sessions/start` |
| GET | `/v1/tracking-sessions/my` |
| GET | `/v1/tracking-sessions/:id` |
| POST | `/v1/tracking-sessions/:id/points/batch` |
| POST | `/v1/tracking-sessions/:id/end` |

### Notificaciones

| Método | Path |
|--------|------|
| GET | `/v1/notifications/preferences` |
| POST | `/v1/notifications/devices/register` |
| POST | `/v1/notifications/devices/unregister` |

---

## Normalización de respuestas

| Dominio | Utilidad |
|---------|----------|
| Usuario auth | `normalizeAuthUser` |
| Servicios | `normalizeService` |
| Tracking | `trackingSessionService` normalizers |

Siempre normalizar en capa service antes de exponer a UI.

---

## Errores

| Utilidad | Uso |
|----------|-----|
| `getApiErrorMessage` | Mensaje user-friendly |
| `networkErrors.ts` | Clasificar red vs auth inválido |
| `NETWORK_UNAVAILABLE_MESSAGE` | Copy estándar sin conexión |

Patrón: servicios **throw**; hooks capturan y setean `error` en UI.

---

## Trazabilidad

Background tasks envían header `x-trace-id` generado con `buildTraceId(prefix)` para correlación en logs backend.

---

## Convenciones al agregar endpoints

1. Añadir constante en `endpoints.ts`.
2. Implementar función en `src/services/<dominio>Service.ts`.
3. Consumir desde hook o pantalla — no axios directo en componentes UI.
4. Documentar aquí el nuevo path.
