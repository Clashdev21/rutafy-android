# Módulos operativos

Descripción de las áreas funcionales de la app por rol.

---

## Mensajero (`/mensajero`)

### Propósito

Operador en campo que recibe ofertas, acepta servicios y ejecuta entregas con tracking de ubicación.

### Estructura de rutas

```
/mensajero/(tabs)/
  index      → Inicio (estados operativos)
  actividad  → Historial / actividad
  cuenta     → Perfil, disponibilidad, captura logística
/mensajero/[id] → Detalle de servicio
```

### Estado central

- **Context:** `MensajeroOperationsContext` → `useMensajeroOperations`
- **Hook:** `src/hooks/useMensajeroOperations.ts`

Responsabilidades:

| Función | Descripción |
|---------|-------------|
| Disponibilidad online/offline | PATCH availability |
| Polling ofertas activas | Intervalos configurables (`mensajeroPollIntervals`) |
| Servicios propios | Lista “my services” |
| Aceptar oferta | POST accept offer |
| Sync background GPS | `syncBackgroundTracking` cuando online + servicio activo |

### Pantallas por estado (Inicio)

Componentes en `src/components/mensajero/`:

- Offline, Available, Offer, Assigned, InService, etc.

La UI refleja máquina de estados derivada de servicios y ofertas del backend.

### Heartbeat GPS

Cuando el mensajero está operativo en background, `backgroundLocationTask` envía ubicación throttled a:

`POST /v1/mensajero/heartbeat`

Ver [GPS y tracking](./gps-tracking.md).

---

## Transportista (`/transportista`)

### Propósito

Empresa o operador que **solicita** servicios de mensajería y gestiona su operación.

### Estructura de rutas

```
/transportista/(tabs)/
  index      → Panel principal / servicios
  actividad  → Actividad
  cuenta     → Perfil, captura logística
/transportista/crear  → Crear servicio
/transportista/[id]   → Detalle servicio
```

### Estado central

- **Context:** `TransportistaServicesContext`
- **Hook:** `useTransportistaServices`
- **Service:** `src/services/transportistaService.ts`

`actor_id` del usuario autenticado se usa como `requesterCompanyId` para listar y crear servicios.

### Acciones típicas

- Listar servicios de la empresa
- Crear servicio (`/transportista/crear`)
- Ver detalle, cancelar (si aplica reglas de negocio)
- Cierre con PIN (`transportistaClosePin` utils)

---

## Captura logística (`/captura-logistica`)

### Propósito

Modo **operador logístico** para registrar rutas GPS (terminal, patio, puerto, etc.). Disponible para mensajero y transportista autenticados.

### Rutas

```
/captura-logistica/           → Iniciar / control sesión activa
/captura-logistica/historial  → Sesiones del operador
/captura-logistica/[sessionId] → Detalle sesión (read-only)
```

### Hook principal

`useOperatorTrackingSession` — orquesta:

- Permisos GPS foreground + background
- Sesión local + remote sync
- Start / end session API
- Foreground service Android
- Task background `operatorTrackingTask`

### Ownership

`trackingSessionOwnership.ts` — hidrata sesión local solo si coincide `user_id`, `actor_id`, `actor_type` del usuario actual.

---

## Evidencias

`src/services/evidenceService.ts` — upload de evidencias asociadas a servicios (fotos, etc.) vía endpoints de evidences.

---

## Extensión futura (no implementado en app)

| Feature | Estado |
|---------|--------|
| Push `dispatch_offer` | Backend Sprint 1A; app listeners preparados, sin handler de negocio |
| Navegación `/mensajero/ofertas` | Ruta no definida; usar `/mensajero` hasta Sprint 1C |

Al agregar features, mantener separación mensajero / transportista / captura.
