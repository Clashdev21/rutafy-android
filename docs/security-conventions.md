# Seguridad y convenciones

Normas para desarrollo seguro y consistente en Rutafy Android.

---

## Datos sensibles — qué NO commitear

| Tipo | Dónde va |
|------|----------|
| JWT access/refresh | SecureStore en device |
| Expo push token | SecureStore (`pushTokenStorage`) |
| `.env.local` con URLs privadas | Local / CI secrets |
| Credenciales EAS/FCM | Expo dashboard / CI |
| Contraseñas de prueba | Gestor de secretos del equipo |

`.env.example` solo contiene URL pública de API sin secretos.

---

## Qué NO loguear

- Tokens JWT completos
- Expo push tokens completos
- Contraseñas
- Teléfonos / documentos de usuarios reales en producción

Preferir:

```typescript
console.log('[push-token]', { prefix: token.slice(0, 24) + '…' });
```

Logs `[auth-logout-reason]` solo en `__DEV__` donde aplique.

---

## SecureStore

Usado para:

- Auth tokens (`tokenStorage`)
- Push token + device_id (`pushTokenStorage`)
- Sesión tracking activa
- Health audit operator (DEV)

Patrón: helpers `getItem` / `setItem` con fallback web → localStorage.

---

## Auth — reglas

1. Toda ruta operativa pasa por `AuthNavigationGuard`.
2. ADMIN explícitamente rechazado en móvil.
3. Sesión requiere `actor_id` válido para operar.
4. Refresh token rotation manejado en interceptor axios.
5. Session expired → evento global → redirect login.

---

## Convenciones de código

### Imports

- Alias `@/` para `src/`
- Side-effect imports solo para task registration en `_layout`

### Servicios vs hooks

| Capa | Puede UI | Puede axios/fetch |
|------|----------|-------------------|
| `components/` | Sí | No (usar hooks/services) |
| `hooks/` | No | Vía services |
| `services/` | No | Sí |

### Tipos

Dominio en `src/types/`. Evitar `any` en normalizers; usar guards y `pickStr` patterns existentes.

### Nombres de tasks

Constantes exportadas — usar siempre la constante, no string literal:

- `BACKGROUND_LOCATION_TASK_NAME`
- `OPERATOR_TRACKING_TASK_NAME`

---

## Módulos congelados (cambiar con cautela)

Requieren revisión de arquitectura + prueba en device:

- `backgroundLocationTask.ts`
- `operatorTrackingTask.ts`
- `useMensajeroOperations.ts`
- `useOperatorTrackingSession.ts`

---

## Pull requests — checklist

- [ ] `npx tsc --noEmit` pasa
- [ ] Sin secretos en diff
- [ ] Cambios GPS/push probados en device físico si aplica
- [ ] Docs actualizados si cambia auth, API, push o tracking
- [ ] No mezclar refactor grande con feature

---

## Privacidad operador

Captura logística muestra consentimiento explícito antes de iniciar sesión GPS. No almacenar ni transmitir datos fuera de endpoints documentados.

---

## Reporte de incidentes

Si se filtra un token en log/crash:

1. Rotar / invalidar sesión afectada en backend
2. Desregistrar device push si aplica
3. Revisar que el fix no vuelva a loguear el dato
