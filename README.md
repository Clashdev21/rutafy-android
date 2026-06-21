# Rutafy Android

Aplicación móvil operativa de **Rutafy** para mensajeros y transportistas en el corredor logístico portuario.

**Stack:** Expo SDK 56 · React Native · Expo Router · SecureStore · Expo Notifications

---

## Documentación

La documentación técnica oficial está en **[`docs/`](./docs/README.md)**:

| Guía | Descripción |
|------|-------------|
| [Onboarding](./docs/onboarding.md) | Welcome, login, registro, roles, AuthProvider |
| [Tracking GPS](./docs/tracking.md) | Sesiones, background location, captura logística |
| [Builds (Expo / EAS)](./docs/builds.md) | Validaciones, preview, production |
| [Inicio rápido](./docs/getting-started.md) | Setup local y primer run |
| [Arquitectura](./docs/architecture.md) | Capas, carpetas, patrones |
| [Auth y navegación](./docs/auth-navigation.md) | Onboarding, sesión, guards |
| [Módulos operativos](./docs/operational-modules.md) | Mensajero, transportista, captura |
| [GPS y tracking](./docs/gps-tracking.md) | Background location, captura logística |
| [Push notifications](./docs/push-notifications.md) | Registro device, listeners |
| [Integración API](./docs/api-integration.md) | Endpoints y cliente HTTP |
| [Builds y mantenimiento](./docs/builds-maintenance.md) | EAS, permisos, releases |
| [Seguridad](./docs/security-conventions.md) | Secretos, logs, convenciones |

---

## Inicio rápido

```bash
npm install
cp .env.example .env.local   # ajustar EXPO_PUBLIC_API_URL si aplica
npx expo start
```

Para GPS y push reales, usar **development build** en dispositivo físico:

```bash
npx expo run:android
# o
eas build --profile development --platform android
```

---

## Roles soportados

| Rol | Ruta home |
|-----|-----------|
| Mensajero | `/mensajero` |
| Transportista | `/transportista` |

Administrador: solo web, no soportado en app móvil.

---

## Verificación

```bash
npx tsc --noEmit
```

---

## Recursos Expo

- [Expo SDK 56 docs](https://docs.expo.dev/versions/v56.0.0/)
- [Expo Router](https://docs.expo.dev/router/introduction/)
