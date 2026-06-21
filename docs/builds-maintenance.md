# Builds y mantenimiento

Guía para releases, permisos nativos y operación del proyecto.

---

## Identidad de la app

| Campo | Valor |
|-------|-------|
| Nombre | Rutafy |
| Slug Expo | `rutafy-android` |
| Package Android | `com.rutafy.rutafyandroid` |
| Versión app | `1.0.0` (app.json) |
| Scheme deep link | `rutafyandroid` |

EAS projectId configurado en `app.json` → `extra.eas.projectId` (requerido para Expo Push Token).

---

## Perfiles EAS (`eas.json`)

| Profile | Uso |
|---------|-----|
| `development` | Dev client, distribución internal |
| `preview` | QA / preview APK internal |
| `production` | Store / producción, autoIncrement version |

```bash
# Instalar EAS CLI
npm install -g eas-cli

# Login Expo
eas login

# Build Android
eas build --profile preview --platform android
eas build --profile production --platform android
```

---

## Scripts npm

| Script | Comando |
|--------|---------|
| Start | `npm start` / `npx expo start` |
| Android local | `npm run android` |
| Web | `npm run web` |
| Typecheck | `npx tsc --noEmit` |

---

## Plugins nativos (app.json)

Cambios en plugins **requieren rebuild**, no bastan con OTA JS:

- `expo-router`
- `expo-splash-screen`
- `expo-secure-store`
- `expo-location` (background + FGS)
- `expo-notifications`
- `expo-image`

Checklist post-cambio plugin:

1. `eas build` nuevo binary
2. Probar permisos en device físico
3. Probar push + GPS background en preview

---

## Permisos Android — matriz

| Permiso | Módulo |
|---------|--------|
| Location fine/coarse | Mensajero + captura |
| Background location | Tasks GPS |
| Foreground service | Location updates |
| Notifications (POST_NOTIFICATIONS) | expo-notifications plugin |

---

## Assets e iconos

- Icono app: `assets/images/icon.png` (1024×1024)
- Adaptive foreground: `assets/images/android-icon-foreground.png`
- Splash: `assets/images/splash-icon.png`
- Brand SVG/PNG: `assets/brand/`, `src/assets/brand/`

Validar con `npx expo-doctor` tras cambios de assets.

---

## Mantenimiento rutinario

### Dependencias Expo

Seguir [Expo SDK upgrades](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/). Proyecto en **SDK 56**.

```bash
npx expo install --fix
npx expo-doctor
```

### TypeScript

Ejecutar `npx tsc --noEmit` en CI o pre-PR.

### Logs en campo

Tags útiles para soporte (sin PII):

- `[auth-logout-reason]`
- `[auth-network-error]`
- `[push-register-error]`
- `[operator-bg-*]`
- `[bg-heartbeat-payload]` (solo DEV)

Pedir al operador **hora aproximada + acción**, nunca screenshots con tokens.

---

## Troubleshooting común

| Síntoma | Causa probable | Acción |
|---------|----------------|--------|
| Push no registra | Emulador / sin projectId | Device físico + verificar app.json |
| GPS background para | Permiso “solo while using” | Settings → ubicación → Always |
| 401 loop | Refresh token inválido | Logout manual, login de nuevo |
| Sesión captura huérfana | Kill app mid-capture | Ver ownership + storage local |
| ADMIN no entra | By design | Usar web admin |

---

## OTA vs native

Expo Updates (si se habilita) solo aplica cambios JS/assets. Cualquier cambio en:

- `app.json` plugins
- permisos
- native modules nuevos

→ **nuevo build EAS**.

---

## Contactos internos (plantilla)

| Área | Responsable |
|------|-------------|
| Backend API | Equipo Rutafy backend |
| EAS / credenciales FCM | DevOps / mobile lead |
| Cuentas staging | QA lead |

Completar en wiki interna del equipo; no incluir credenciales en repo.
