# Inicio rápido

Guía para que un desarrollador nuevo pueda ejecutar Rutafy Android en local.

---

## Requisitos

| Herramienta | Versión recomendada |
|-------------|---------------------|
| Node.js | LTS (20+) |
| npm | Incluido con Node |
| Android Studio | Para emulador o device físico |
| EAS CLI | Opcional; necesario para builds cloud |

---

## Setup

```bash
git clone <repo-url>
cd rutafy-android
npm install
```

### Variables de entorno

Copiar `.env.example` a `.env.local` (o exportar en shell):

```bash
EXPO_PUBLIC_API_URL=https://api.rutafy.app
```

La URL apunta al backend REST de Rutafy. Para entornos de staging, usar la URL que indique el equipo de backend **sin commitear credenciales**.

---

## Ejecutar en desarrollo

```bash
npx expo start
```

Opciones habituales:

- **`a`** — Abrir en emulador/dispositivo Android (requiere dev client o build nativo).
- **`w`** — Web (limitado; no representa comportamiento GPS/push real).

### Dev client vs Expo Go

Rutafy usa:

- Ubicación en background
- Foreground service (Android)
- SecureStore
- Push notifications nativas

Por ello **se recomienda development build** (`eas build --profile development`), no Expo Go para pruebas operativas.

```bash
npx expo run:android
# o
eas build --profile development --platform android
```

---

## Verificación inicial

1. App abre en `/welcome` si no hay sesión.
2. Login con credenciales de prueba provistas por el equipo (nunca usar cuentas reales de producción en logs).
3. Usuario mensajero → home `/mensajero`.
4. Usuario transportista → home `/transportista`.

### TypeScript

```bash
npx tsc --noEmit
```

---

## Estructura mental del repo

```
src/
  app/           # Rutas Expo Router (pantallas)
  auth/          # AuthProvider, contexto, tokens
  api/           # Cliente axios + endpoints
  services/      # Lógica de dominio / integraciones
  hooks/         # Estado y efectos reutilizables
  components/    # UI por dominio
  storage/       # Persistencia local (SecureStore)
  types/         # Tipos TypeScript
  utils/         # Helpers puros
```

El alias `@/` apunta a `src/` (ver `tsconfig.json`).

---

## Cuentas de prueba

Solicitar al equipo:

- Usuario **mensajero** de staging
- Usuario **transportista** de staging
- Acceso admin web solo si se prueba push test desde panel

**No documentar ni compartir:** contraseñas, tokens JWT, Expo push tokens, IDs de dispositivo reales.

---

## Próximos pasos

1. Leer [Arquitectura](./architecture.md)
2. Leer [Autenticación y navegación](./auth-navigation.md)
3. Según tu tarea: [Módulos operativos](./operational-modules.md) o [Push notifications](./push-notifications.md)
