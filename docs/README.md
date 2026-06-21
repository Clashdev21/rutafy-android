# Documentación técnica — Rutafy Android

Documentación oficial de la aplicación móvil Rutafy para operadores logísticos en campo.

**Stack:** Expo SDK 56 · React Native · Expo Router · SecureStore · Expo Notifications

---

## Audiencia

| Documento | Para quién |
|-----------|------------|
| [Onboarding](./onboarding.md) | Flujo welcome, login, registro, roles y guards |
| [Tracking GPS](./tracking.md) | Background location, sesiones, ownership, captura, sync |
| [Inicio rápido](./getting-started.md) | Nuevo desarrollador (setup local, primer run) |
| [Arquitectura](./architecture.md) | Entender capas, carpetas y decisiones |
| [Autenticación y navegación](./auth-navigation.md) | Onboarding, sesión, guards, rutas |
| [Módulos operativos](./operational-modules.md) | Mensajero, transportista, captura logística |
| [GPS y tracking](./gps-tracking.md) | Background location, captura logística |
| [Push notifications](./push-notifications.md) | Permisos, ExpoPushToken, listeners, foreground/background/cold start, dispatch_offer |
| [Integración API](./api-integration.md) | Cliente HTTP, endpoints, errores |
| [Builds (Expo / EAS)](./builds.md) | Validaciones, preview, production, checklist |
| [Builds y mantenimiento](./builds-maintenance.md) | Troubleshooting, permisos, OTA |
| [Seguridad y convenciones](./security-conventions.md) | Secretos, logs, patrones de código |

---

## Principios del proyecto

1. **Móvil operativo, no admin** — Solo roles `MENSAJERO` y `TRANSPORTISTA`. `ADMIN` se rechaza en app.
2. **Backend como fuente de verdad** — La app consume REST; no recalcula reglas de negocio críticas.
3. **Resiliencia en campo** — Fallos de red o push no bloquean login ni operación principal.
4. **Separación de concerns GPS** — Heartbeat mensajero y captura logística usan tasks distintas.
5. **Documentación viva** — Si cambias auth, tracking o push, actualiza el doc correspondiente.

---

## Enlaces externos

- [Expo SDK 56](https://docs.expo.dev/versions/v56.0.0/)
- [Expo Router](https://docs.expo.dev/router/introduction/)
- [EAS Build](https://docs.expo.dev/build/introduction/)
