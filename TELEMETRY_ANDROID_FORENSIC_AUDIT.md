---
title: "Auditoría Forense de Telemetría Android — Rutafy"
subtitle: "GPS → Expo Location → TaskManager → cola → HTTP → Journey"
document_type: forensic-audit
classification: internal
status: complete
date: 2026-10-02
repo: rutafy-android
scope: read-only
platforms: [android]
sdk: "Expo 56"
expo_location: "56.0.18"
expo_task_manager: "56.0.19"
react_native: "0.85.3"
audit_complete: true
production_changed: false
staging_changed: false
upstream_expo_match: possible
primary_hypothesis: "FGS/TaskManager irregular delivery (~80s gaps) + FG no respalda BG + sin event_id E2E + RECEIVE_BOOT_COMPLETED ausente"
export_formats: [markdown, pdf-via-pandoc, notion, confluence]
---

# Auditoría Forense de Telemetría Android — Rutafy

| Campo | Valor |
|------:|:------|
| **Documento** | Telemetría Android — Forensic Audit |
| **Tipo** | Auditoría forense READ-ONLY |
| **Fecha** | 2026-10-02 |
| **Repositorio** | `rutafy-android` (Expo / React Native) |
| **Alcance** | Pipeline GPS Android (captura logística + heartbeat mensajero) |
| **Restricción** | Sin cambios de código, builds, installs ni configuración STAGING/PRODUCTION |
| **Estado** | COMPLETO |

> **Cómo exportar:** este archivo es Markdown CommonMark autocontenido. Compatible con GitHub, Notion (import MD), Confluence (Markdown macro), Google Docs (pegar MD), y PDF vía `pandoc TELEMETRY_ANDROID_FORENSIC_AUDIT.md -o audit.pdf`.

## Índice

1. [Executive Summary](#1-executive-summary)
2. [Environment & Versions](#2-environment--versions)
3. [Android Configuration](#3-android-configuration)
4. [Telemetry Architecture Found](#4-telemetry-architecture-found)
5. [Lifecycle Analysis](#5-lifecycle-analysis)
6. [GPS Event Pipeline](#6-gps-event-pipeline)
7. [Local Persistence & Retry](#7-local-persistence--retry)
8. [Backend Ingestion](#8-backend-ingestion)
9. [Journey Association](#9-journey-association)
10. [Staging vs Production](#10-staging-vs-production)
11. [Expo Known-Issue Comparison](#11-expo-known-issue-comparison)
12. [Gap Analysis](#12-gap-analysis)
13. [Failure Matrix](#13-failure-matrix)
14. [Observability Assessment](#14-observability-assessment)
15. [Root-Cause Hypotheses](#15-root-cause-hypotheses)
16. [Recommended Actions P0–P3](#16-recommended-actions-p0p3)
17. [Exact Files Inspected](#17-exact-files-inspected)
18. [Open Questions](#18-open-questions)
19. [Appendix A — Parámetros exactos](#appendix-a--parámetros-exactos-startlocationupdatesasync)

## Veredicto rápido

| Clave | Valor |
|------:|:------|
| `AUDIT_COMPLETE` | YES |
| `UPSTREAM_EXPO_MATCH` | POSSIBLE |
| `PRODUCTION_CHANGED` | NO |
| `STAGING_CHANGED` | NO |
| **Hipótesis primaria** | FGS/TaskManager Android+Expo puede dejar de entregar callbacks (~80s gaps no esperados por `timeInterval=20s`); agravado porque FG no respalda cuando BG aparece activo; sin `event_id` E2E; `RECEIVE_BOOT_COMPLETED` ausente en `app.json` |

---

## 1. Executive Summary

Rutafy Android implementa **dos pipelines GPS independientes** sobre Expo Location + TaskManager:

| Pipeline | Task | Destino HTTP |
|----------|------|--------------|
| Captura logística (operator) | `rutafy-operator-tracking` | `POST /v1/tracking-sessions/:id/points/batch` |
| Heartbeat mensajero | `rutafy-background-location` | `POST /v1/mensajero/heartbeat` |

La captura logística (donde viven Journey / tracking_session) tiene:

- Foreground service + background location habilitados en config Expo.
- Intervalos configurados de **20 s / 10 m** (operator BG) y watch FG paralelo **20 s / 10 m**.
- **Cola durable AsyncStorage** para background (persistencia antes del POST).
- Buffer **solo en memoria** para foreground.
- Asociación Journey vía `metadata.journey_id` en `POST /v1/tracking-sessions/start` (bootstrap operacional).
- **Sin `event_id` / UUID por punto**; dedupe local por `captured_at|lat|lng`.
- Backend **no está en este repositorio** → ingestión/DB/Journey server-side = **NOT VERIFIABLE READ-ONLY**.

Los gaps históricos (~86.7 s estacionario, ~82 s desconocido) **no coinciden** con el intervalo configurado de 20 s. Son candidatos a **UNEXPECTED LOSS** o throttling nativo, no a “sampling esperado”.

Hipótesis primaria (evidencia de código + issues Expo en SDK 56):

> Combinación de **lifecycle Android / Expo Location FGS** (posiblemente #47595 / #49424) + **pérdida de `timeInterval` tras restore** (#46788) + **ausencia de `RECEIVE_BOOT_COMPLETED` en app.json** (#48935) + límites de observabilidad (sin ID de evento end-to-end).

No se confirma un único bug; se clasifican múltiples categorías con evidencia.

---

## 2. Environment & Versions

### Lockfile

- **Archivo:** `package-lock.json` (npm lockfileVersion 3)
- **No** hay `yarn.lock` ni `pnpm-lock.yaml`

### Tabla de dependencias

| Dependency | package.json | Resolved | Observation |
|------------|--------------|----------|-------------|
| expo | ~56.0.12 | **56.0.12** | SDK 56 |
| react-native | 0.85.3 | **0.85.3** | Exacto |
| react | 19.2.3 | **19.2.3** | Exacto |
| expo-location | ~56.0.18 | **56.0.18** | Background + FGS |
| expo-task-manager | ~56.0.19 | **56.0.19** | Tasks BG |
| expo-updates | — | **NOT_IN_LOCK** | No instalado; OTA path de #47595 no aplica vía expo-updates |
| @react-native-async-storage/async-storage | 2.2.0 | **2.2.0** | Cola durable operator |
| expo-secure-store | ~56.0.4 | **56.0.4** | Sesión activa + tokens |
| axios | ^1.16.1 | **1.16.1** | FG HTTP + auth |
| expo-battery | ~56.0.4 | **56.0.4** | Telemetría auxiliar |
| expo-device | ~56.0.4 | **56.0.4** | Device info |
| expo-sensors | ~56.0.6 | **56.0.6** | Motion telemetry |
| expo-notifications | ~56.0.18 | **56.0.18** | Push (no GPS) |
| expo-constants | ~56.0.16 | **56.0.18** | Resolved ligeramente por encima del rango declarado |
| expo-dev-client | ~56.0.20 | **56.0.20** | Dev builds |
| expo-router | ~56.2.11 | **56.2.11** | Entry + `_layout` importa tasks |
| expo/fetch | (via expo) | bundled | Usado en BG tasks |

`node_modules` **ausente** en el workspace auditado → no se pudo inspeccionar el AAR/Kotlin de `expo-location` instalado localmente. Versiones resueltas tomadas del lockfile.

---

## 3. Android Configuration

### 3.1 Expo config

**Archivos:** `app.json` + `app.config.js` (dinámico; mergea plugins y `googleServicesFile`).

| Campo | Valor |
|-------|-------|
| android.package | `com.rutafy.rutafyandroid` |
| scheme | `rutafyandroid` |
| plugins relevantes | `expo-location` con `isAndroidBackgroundLocationEnabled: true`, `isAndroidForegroundServiceEnabled: true` |
| EAS projectId | presente en `extra.eas` (no secreto de API) |

**Permisos declarados en `app.json` → `android.permissions`:**

- ACCESS_FINE_LOCATION
- ACCESS_COARSE_LOCATION
- ACCESS_BACKGROUND_LOCATION
- FOREGROUND_SERVICE
- FOREGROUND_SERVICE_LOCATION
- POST_NOTIFICATIONS
- CAMERA

**NO declarado en app.json:** `RECEIVE_BOOT_COMPLETED` / `android.permission.RECEIVE_BOOT_COMPLETED`.

### 3.2 AndroidManifest — estado forense

No existe `AndroidManifest.xml` fuente en el repo (managed Expo; manifest generado en prebuild/EAS).

| Permiso / componente | Estado | Notas |
|----------------------|--------|-------|
| ACCESS_FINE_LOCATION | PRESENT (app.json) / GENERATED BY EXPO | Declarado explícitamente |
| ACCESS_COARSE_LOCATION | PRESENT (app.json) / GENERATED BY EXPO | Declarado explícitamente |
| ACCESS_BACKGROUND_LOCATION | PRESENT (app.json) / GENERATED BY EXPO | + plugin expo-location |
| FOREGROUND_SERVICE | PRESENT (app.json) / GENERATED BY EXPO | |
| FOREGROUND_SERVICE_LOCATION | PRESENT (app.json) / GENERATED BY EXPO | + plugin FGS location |
| RECEIVE_BOOT_COMPLETED | ABSENT (app.json) / UNKNOWN (merged APK) | Crítico vs Expo #48935; sin APK mergeado no verificable |
| LocationTaskService / TaskBroadcastReceiver | GENERATED BY EXPO (esperado) | Sin manifest local; UNKNOWN en merge final |
| BOOT_COMPLETED receiver | GENERATED BY EXPO (expo-task-manager, según upstream) | Permission companion ausente en app.json |

### 3.3 Hallazgo

```
FILE: app.json
FUNCTION: expo.android.permissions / plugins[expo-location]
EVIDENCE: Background location + FGS habilitados; RECEIVE_BOOT_COMPLETED no listado
IMPACT: Config GPS BG correcta en apariencia; riesgo de crash JobScheduler en Android 16 si el permission no entra al merge
CONFIDENCE: HIGH (ausencia en app.json); MEDIUM (efecto en APK final sin merge)
```

---

## 4. Telemetry Architecture Found

```
┌─────────────────────────────────────────────────────────────────┐
│ CAPTURA LOGÍSTICA (Journey / tracking_session)                  │
│                                                                 │
│  GPS → Expo Location                                            │
│        ├─ watchPositionAsync (FG, Accuracy.Balanced, 20s/10m)   │
│        └─ startLocationUpdatesAsync (BG task, High, 20s/10m)    │
│              → TaskManager defineTask rutafy-operator-tracking  │
│              → locationsToTrackingPoints / toTrackingPoint      │
│              → AsyncStorage pending queue                       │
│              → expo/fetch POST .../points/batch                 │
│                                                                 │
│  Sesión: POST /v1/tracking-sessions/start                       │
│          metadata.journey_id ← bootstrap operacional            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ HEARTBEAT MENSAJERO (no Journey points)                         │
│                                                                 │
│  GPS → startLocationUpdatesAsync rutafy-background-location     │
│      → throttle 30s → POST /v1/mensajero/heartbeat {lat,lng}    │
│  + watchPositionAsync FG (10s/10m) para UI/heartbeat online     │
└─────────────────────────────────────────────────────────────────┘
```

**Exclusión mutua:** `startOperatorTrackingAsync` no arranca si `rutafy-background-location` ya está activa.

```
FILE: src/services/operatorTrackingService.ts
FUNCTION: startOperatorTrackingAsync
EVIDENCE: isMessengerBackgroundTrackingStarted() → return false
IMPACT: Durante servicio mensajero activo, captura logística BG no inicia → gaps de Journey si se esperaba captura
CONFIDENCE: HIGH
```

---

## 5. Lifecycle Analysis

### Diagrama textual (captura logística — código real)

```
[App boot]
  _layout.tsx importa backgroundLocationTask + operatorTrackingTask
  → TaskManager.defineTask (si no definidos)
       │
[Usuario autenticado + pantalla captura / bootstrap]
       │
A. INICIO TRACKING
  startCapture()
    → assertCanStartOperatorCapture
    → POST /v1/tracking-sessions/start (metadata ± journey_id)
    → SecureStore setActive(session)
    → clear pending queue + health
    → startOperatorTrackingAsync (permisos BG + FGS)
    → startWatch (watchPositionAsync)
       │
B. APP → BACKGROUND
  AppState 'background' → diagnóstico app-background
  FG watch puede degradarse; BG FGS es fuente primaria
  Si operatorBgActive: FG callback NO bufferiza puntos
       │
C. PANTALLA BLOQUEADA
  Sin lógica dedicada distinta de background
  Depende de FGS location nativo
       │
D. APP → FOREGROUND
  AppState 'active'
    → runOperatorBgHealthCheck (hasStartedLocationUpdatesAsync)
    → bootstrap sync (mensajero) source=foreground
  NO hace stop+restart forzado del location task si ya "started"
       │
E. SIN CONECTIVIDAD
  BG: enqueue durable → POST falla → requeueFront → espera próximo callback
  FG: buffer memoria; reinserta batch al fallar (si BG off)
       │
F. RECUPERA CONECTIVIDAD
  Sin NetInfo listener dedicado en operator task
  Reintento oportunista en próximo evento GPS / drain finalization
  Bootstrap: needsRetryOnReconnect (mensajero)
       │
G. PROCESS DEATH
  SecureStore sesión + AsyncStorage queue sobreviven
  TaskManager puede restaurar task nativa (OS)
  timeInterval puede perderse en restore (#46788) — ver §11
  Mirror sync activeSessionIdSync se pierde hasta getActive()
       │
H. REABRE APP
  hydrateFromStorage:
    ownership check → GET session → ensureOperatorBackgroundTracking → startWatch
  ensure: si hasStarted==true → return true SIN reenviar options
       │
I. ESTACIONARIO
  distanceInterval=10m no dispara; depende de timeInterval=20s
  Gaps >60s se clasifican diagnóstico "stationary" si desplazamiento ≤30m
       │
J. VUELVE A MOVERSE
  distanceInterval puede acelerar delivery; gap classifier → movement_suspected
```

```
FILE: src/hooks/useOperatorTrackingSession.ts
FUNCTION: AppState listeners + hydrateFromStorage
EVIDENCE: Health check al resume; no reinicio agresivo de FGS si alreadyStarted
IMPACT: Estado “FGS aparente activo / callbacks muertos” puede no autorrepararse
CONFIDENCE: HIGH
```

---

## 6. GPS Event Pipeline

Flujo real de **una** observación en captura logística con BG activo:

```
LOCATION PROVIDER (Android Fused)
  FILE: nativo expo-location LocationTaskConsumer
  CONDICIÓN: task started + permisos + FGS
  PÉRDIDA: doze, FGS freeze, killService, permiso revocado
  RECUPERACIÓN: ensureOperatorBackgroundTracking (parcial)
↓
TaskManager callback
  FILE: src/services/operatorTrackingTask.ts
  FUNCTION: defineTask('rutafy-operator-tracking', ...)
  CONDICIÓN: error==null; sessionId en SecureStore; locations no vacías
  PÉRDIDA: drop no_session / empty_points / error GPS
  RECUPERACIÓN: ninguna para el fix perdido; health drop counter
↓
transformación
  FILE: src/utils/trackingPointMapper.ts
  FUNCTION: locationsToTrackingPoints → toTrackingPoint
  CONDICIÓN: lat/lng finitos; guard temporal session-scoped
  PÉRDIDA: tracking-fix-invalid; tracking-fix-temporal-rejected
  RECUPERACIÓN: ninguna (descarte intencional)
↓
validación temporal
  FILE: src/utils/trackingTemporalGuard.ts
  FUNCTION: evaluateSessionFixTemporalValidity
  CONDICIÓN: capturedAt dentro de sesión ±5s early / no futuro >30s
  PÉRDIDA: pre_session_fix / future_fix / invalid_timestamp
  RECUPERACIÓN: ninguna
↓
persistencia local (ANTES del HTTP)
  FILE: src/storage/operatorTrackingPendingQueue.ts
  FUNCTION: enqueue
  CONDICIÓN: sessionId match; max 1000 puntos
  PÉRDIDA: overflowDropped (más antiguos); cambio de sessionId reemplaza cola
  RECUPERACIÓN: durable hasta overflow
↓
queue / drain
  FILE: src/services/operatorTrackingTask.ts
  FUNCTION: enqueueAndFlushBackgroundPoints
  CONDICIÓN: !finalizationActive || forceFlush; max 1 POST in-flight
  PÉRDIDA: si proceso muere post-dequeue pre-ACK → at-least-once/dupe risk al requeue
  RECUPERACIÓN: requeueFront en error HTTP; drenaje post-inflight
↓
HTTP
  FILE: operatorTrackingTask.executeBatchPost
  FUNCTION: expoFetch POST points/batch + Bearer + x-trace-id
  CONDICIÓN: token válido; session active
  PÉRDIDA: timeout/red → throw → requeue; 401 refresh once; session_not_active → cleanup local
  RECUPERACIÓN: retry oportunista (próximo callback), refresh 401
↓
backend / DB / tracking_session / journey_id
  FILE: NOT IN REPO
  STATUS: NOT VERIFIABLE READ-ONLY
  Cliente asocia journey solo en start metadata; batch no reenvía journey_id por punto
```

### Canal foreground (solo si BG inactivo)

```
watchPositionAsync → bufferRef (memoria) → flush 12s o ≥5 pts → axios sendTrackingPointsBatch
```

```
FILE: src/hooks/useOperatorTrackingSession.ts
FUNCTION: watch callback
EVIDENCE: if (operatorBgActiveRef.current) return; // no bufferiza
IMPACT: Con BG activo, puntos FG se descartan a propósito; si BG callback falla, no hay fallback FG
CONFIDENCE: HIGH
```

---

## 7. Local Persistence & Retry

### Tecnología

| Canal | Tecnología | Durable? |
|-------|------------|----------|
| Sesión activa | SecureStore (`rutafy_tracking_session_active`) | Sí |
| Cola BG puntos | AsyncStorage (`rutafy_operator_tracking_pending_points`) | Sí |
| Buffer FG | `bufferRef` memoria | No |
| Health / diagnósticos | AsyncStorage keys en trackingDiagnostics / healthStorage | Sí (parcial) |
| Heartbeat mensajero | Solo memoria (`lastSentAt`, throttle) | No |

### Respuestas forenses

| Pregunta | Respuesta |
|----------|-----------|
| ¿Se guarda localmente ANTES del POST (BG)? | **SÍ** — enqueue AsyncStorage antes de drain HTTP |
| ¿Sin Internet? | Puntos permanecen en cola; requeue tras fallo; envío en próximos callbacks |
| ¿POST falla? | `requeueFront`; `recordBatchError`; no loop agresivo |
| ¿Timeout? | Tratado como error de red (BG throw / FG ECONNABORTED diagnóstico); requeue/rebuffer |
| ¿Process death post-GPS pre-POST? | Si ya enqueued: sobrevive. Si solo en callback pre-enqueue: riesgo de pérdida. Si dequeued y POST in-flight sin ACK: posible reenvío (at-least-once) |
| ¿Servidor OK, cliente sin respuesta? | Riesgo de **duplicados** (doc `tracking.md` KNOWN RISK); sin idempotency key |
| ¿Retry? | Sí, oportunista (próximo GPS / forceFlush / finalization drain) |
| ¿Backoff? | **NO** exponencial dedicado |
| ¿Durable queue? | **SÍ** (BG operator); **NO** (FG / heartbeat) |
| ¿ACK explícito por evento? | **NO** — solo HTTP batch `accepted` / `accepted_count` |
| ¿Deduplicación? | Local: `captured_at\|lat\|lng`. Backend: NOT VERIFIABLE |

```
FILE: src/storage/operatorTrackingPendingQueue.ts
FUNCTION: enqueue / dequeueBatch / requeueFront
EVIDENCE: mutationChain serializada; MAX 1000; mergePendingPoints dedupe
IMPACT: Buena resiliencia offline BG; overflow y at-least-once son riesgos residuales
CONFIDENCE: HIGH
```

---

## 8. Backend Ingestion

### Endpoint cliente

| Operación | METHOD + PATH |
|-----------|---------------|
| Start session | `POST /v1/tracking-sessions/start` |
| Batch points | `POST /v1/tracking-sessions/:sessionId/points/batch` |
| End | `POST /v1/tracking-sessions/:sessionId/end` |
| Cancel | `POST /v1/tracking-sessions/:sessionId/cancel` |
| Detail | `GET /v1/tracking-sessions/:sessionId` |
| Heartbeat | `POST /v1/mensajero/heartbeat` |
| Bootstrap | `GET/POST` vía `MESSENGER_ENDPOINTS.operationalBootstrap` = `/v1/mensajero/operational-bootstrap` |

### Handler backend

**NOT VERIFIABLE READ-ONLY** — este repo es solo el cliente móvil.

Lo observable desde el cliente:

| Caso | Comportamiento cliente |
|------|------------------------|
| Payload inválido | HTTP error → requeue/rebuffer; mensaje API |
| Duplicados | Cliente puede reenviar; backend UNKNOWN |
| Out-of-order | Cliente ordena por `captured_at` en cola; backend UNKNOWN |
| Eventos antiguos late | Se envían con `captured_at` del device; backend UNKNOWN |
| journey_id faltante | Start puede omitir `metadata.journey_id` si no hay bootstrap |
| session_not_active (409) | Cleanup local + stop tracking |
| 401 | Refresh + un reintento (BG); interceptor axios (FG) |
| 5xx / timeout | Diagnóstico + requeue |

```
FILE: src/services/trackingSessionService.ts
FUNCTION: sendTrackingPointsBatch / startTrackingSession
EVIDENCE: body { points } / { purpose, vehicle_label, consent_accepted, notes, metadata }
IMPACT: Contrato cliente claro; semántica de persistencia Journey en servidor no auditable aquí
CONFIDENCE: HIGH (cliente); N/A (servidor)
```

---

## 9. Journey Association

### Cómo se asocia

1. Bootstrap operacional (`/v1/mensajero/operational-bootstrap`) provee `journey.journey_id` + `tracking.tracking_session_id`.
2. Política `decideMensajeroBootstrapApply` decide start/hydrate/stop/consent.
3. Al iniciar captura, `buildTrackingStartParams` / `mergeJourneyIdIntoStartMetadata` inserta `metadata.journey_id`.
4. `POST /v1/tracking-sessions/start` crea tracking_session remota.
5. Puntos posteriores solo llevan `sessionId` en la URL del batch — **no** reenvían `journey_id`.

### Riesgo: punto persistido pero ausente del Journey esperado

| Escenario | ¿Puede pasar? | Evidencia |
|-----------|---------------|-----------|
| Start sin journey_id en metadata | SÍ | `mergeJourneyIdIntoStartMetadata` solo setea si hay id |
| Captura manual sin bootstrap | SÍ | purpose/vehicle_label path en UI captura |
| Sesión correcta, Journey distinto en backend | UNKNOWN | Server-side |
| Heartbeat puntos en Journey | NO (diseño) | Heartbeat no es points/batch |
| Mensajero BG bloquea operator BG | SÍ | exclusión mutua |
| Ownership mismatch limpia sesión | SÍ | hydrate clear |

```
FILE: src/utils/mensajeroStartFlow.ts
FUNCTION: mergeJourneyIdIntoStartMetadata
EVIDENCE: journey_id solo en metadata de start
IMPACT: Asociación Journey es de sesión, no por evento; fallos de start/bootstrap pueden dejar telemetría huérfana de Journey
CONFIDENCE: HIGH
```

---

## 10. Staging vs Production

Comparación **solo con artefacto en repo** (sin secretos):

| Aspecto | Staging | Production | Diferencia relevante telemetría? |
|---------|---------|------------|----------------------------------|
| applicationId / package | `com.rutafy.rutafyandroid` (único en app.json) | mismo | No en repo |
| API base URL | `EXPO_PUBLIC_API_URL` (runtime/.env) | default `https://api.rutafy.app` | **Sí potencial** — URL distinta por env local/EAS, no por flavor Android |
| Expo plugins / permisos | mismos | mismos | No |
| Background location | mismos flags | mismos | No |
| EAS profiles | development / preview / production | production autoIncrement | Build variant, no lógica GPS distinta en código |
| Feature flags tracking | no hay flags staging-only en código | — | No encontrado |
| Namespace | no flavors productFlavors en repo | — | N/A managed |

```
FILE: src/config/env.ts
FUNCTION: API_BASE_URL
EVIDENCE: process.env.EXPO_PUBLIC_API_URL ?? 'https://api.rutafy.app'
IMPACT: Staging vs prod se diferencia por env var de build/runtime, no por código de sampling GPS
CONFIDENCE: HIGH
```

**Secretos:** si existieran en `.env` local no commiteado → no inspeccionados. `.env.example` solo muestra placeholder de URL (no secret). `google-services.json` referenciado; contenido no volcado (SECRET PRESENT / LOCATION si el archivo real estuviera presente fuera de ejemplo — no listado en tree raíz auditado).

---

## 11. Expo Known-Issue Comparison

Versiones Rutafy: `expo-location@56.0.18`, `expo-task-manager@56.0.19`, SDK 56, RN 0.85.3. Sin `expo-updates`.

### Expo #47595 — FGS aparente activo, sin posiciones

| Campo | Valor |
|-------|-------|
| Clasificación | **POSSIBLY APPLICABLE** |
| Justificación | Misma API: `startLocationUpdatesAsync` + `foregroundService`. SDK 56. `ensureOperatorBackgroundTracking` retorna early si `hasStartedLocationUpdatesAsync===true` sin force restart — compatible con estado “envenenado”. Sin expo-updates → trigger OTA no aplica; updates Play/`adb install -r` sí. No hay evidencia runtime de ANR/logcat en repo. |
| No confirmado | No hay logs de `Foreground location task cannot be started while the app is in the background!` en artefactos |

### Expo #46788 — timeInterval/distanceInterval perdidos en restore

| Campo | Valor |
|-------|-------|
| Clasificación | **HIGHLY COMPATIBLE** |
| Justificación | Reportado presente en `expo-location` 56.0.x; workaround upstream = reenviar options vía live `startLocationUpdatesAsync`/`setOptions`. Rutafy **no** reenvía options si alreadyStarted. Accuracy.High preset interval ~2s si timeInterval se pierde → cadencia **más agresiva**, no gaps largos. Puede coexistir con otros fallos; no explica solo gaps de ~80s, pero sí inconsistencia post process-death. |
| Nota | Comentarios upstream: live path OK; **restore tras process death** es el path roto |

### Expo #48935 — JobScheduler + RECEIVE_BOOT_COMPLETED + Android 16

| Campo | Valor |
|-------|-------|
| Clasificación | **HIGHLY COMPATIBLE** (config) / **POSSIBLY APPLICABLE** (síntoma gaps) |
| Justificación | `app.json` **no** declara `RECEIVE_BOOT_COMPLETED`. Upstream: crash fatal al primer fix si permission ausente (Android 16). Versiones cercanas (task-manager 56.0.18 reportado; Rutafy 56.0.19). Si el síntoma observado es gap (no crash), puede no ser la causa de los ~82s, pero es riesgo P0 de estabilidad. |
| Manifest merge final | UNKNOWN sin APK |

### Expo #49424 — race FGS eligibility / bind

| Campo | Valor |
|-------|-------|
| Clasificación | **POSSIBLY APPLICABLE** |
| Justificación | Rutafy inicia tracking desde UI foreground, pero usuario puede background/lock inmediatamente tras start. Race nativa post-promise. No hay guard adicional. Crash de proceso (no gap silencioso) es el síntoma primario upstream. |

---

## 12. Gap Analysis

### Evidencia histórica

| Gap | ~Duración | Contexto |
|-----|-----------|----------|
| Estacionario | ~86.7 s | dispositivo quieto |
| Origen no determinado | ~82 s | desconocido |

### Configuración esperada (operator BG)

| Parámetro | Valor |
|-----------|-------|
| timeInterval | 20000 ms |
| distanceInterval | 10 m |
| deferredUpdatesInterval | 20000 ms |
| deferredUpdatesDistance | 10 m |
| accuracy | High |

**EXPECTED BY CONFIGURATION:** intervalos del orden de **~20 s** (estacionario, sin movimiento ≥10 m), o más frecuentes si hay movimiento.  
Jitter menor (p.ej. 20–40 s) puede ser plausible por fused provider / batching.

**UNEXPECTED LOSS:** gaps de **~82–87 s** (~4× el intervalo configurado) **no** están explicados por la configuración sola.

### Mecanismos en código que podrían producir ~80–90 s

| Mecanismo | ¿Puede ~80s? | Tipo |
|-----------|--------------|------|
| timeInterval 20s × N callbacks perdidos | Sí (4–5 misses) | UNEXPECTED |
| FG flush 12s | No explica 86s solo | — |
| Heartbeat throttle 30s | Pipeline distinto | — |
| finalization drain 25s | Solo al END | — |
| STALE diagnostic threshold 180s | No genera gaps; solo detecta | — |
| LOCATION_GAP_MIN_MS 60s | Umbral de **clasificación** diagnóstico, no de sampling | — |
| batchInFlight deferral | Retrasa envío, no captura (puntos en cola) | No gap de captura si enqueue OK |
| FGS freeze (#47595) | Sí, gaps arbitrarios | UNEXPECTED |
| Doze / OEM battery | Sí | C / Android |
| Temporal reject | Descarte puntual | B |
| empty_points / no_session drops | Sí | B |

```
FILE: src/services/operatorTrackingService.ts
FUNCTION: startOperatorTrackingAsync options
EVIDENCE: TIME_INTERVAL_MS=20000, DISTANCE_INTERVAL_M=10
IMPACT: 86.7s no es el intervalo configurado → investigar pérdida de callbacks o throttling nativo
CONFIDENCE: HIGH
```

Separación:

- **EXPECTED BY CONFIGURATION:** ~20 s (con jitter razonable).
- **UNEXPECTED LOSS:** ~82–87 s observados.

No asumir que ambos gaps históricos son la misma causa.

---

## 13. Failure Matrix

| Failure point | Can happen? | Evidence | Data lost? | Recoverable? |
|---------------|-------------|----------|------------|--------------|
| GPS provider | YES | Dependencia fused; accuracy/permisos | YES si no hay fix | Parcial (próximo fix) |
| TaskManager callback | YES | defineTask drops; empty_points; error | YES si drop pre-enqueue | No para ese fix |
| background service / FGS | YES | FGS config; #47595/#49424 compat | YES si callbacks paran | Force-close / reinstall; ensure parcial |
| process death | YES | Restore task + storage | FG buffer YES; BG queue NO (si enqueued) | hydrate + ensure |
| stationary device | YES | distanceInterval; gap classifier | No inherent; sampling irregular posible | N/A |
| offline | YES | enqueue durable | No (hasta overflow) | Retry oportunista |
| HTTP failure | YES | requeueFront | No inmediato | Sí |
| timeout | YES | 15s axios FG; fetch BG | No si requeue | Sí |
| authentication failure | YES | 401 + refresh; auth_invalid | Posible si token muerto y no refresh | Parcial |
| backend validation | UNKNOWN | Server not in repo | UNKNOWN | UNKNOWN |
| DB failure | UNKNOWN | Server not in repo | UNKNOWN | UNKNOWN |
| duplicate | YES | at-least-once doc + requeue | No loss; bloat | Dedupe local limitado |
| out-of-order event | YES | late delivery posible | Depende backend | Cliente ordena cola |
| Journey association | YES | journey solo en start metadata | Punto en session pero no Journey | Bootstrap / start |
| app restart | YES | hydrate path | FG buffer | Yes if session+queue |
| device reboot | YES | RECEIVE_BOOT_COMPLETED ausente en app.json | Task may not survive cleanly | User reopen + hydrate |

---

## 14. Observability Assessment

### Capacidad actual (cliente)

| Estado | ¿Instrumentado? | Cómo |
|--------|-----------------|------|
| CAPTURED | Parcial | `gps-fix-received`, `point-mapped`, `tracking-location-callback` |
| QUEUED | Sí (BG) | `point-queued-background`, queueDepth |
| SENT | Parcial | `batch-send`, `batch-created` (batch-level, no event-level) |
| RECEIVED | No client-side | Solo HTTP status |
| PERSISTED | No | Solo `accepted` count agregado |
| ASSOCIATED | No por punto | journey_id solo en start |

Hay pipeline stats, gap timeline, AppState timeline, health storage, `x-trace-id` por batch — **útil pero insuficiente** para demostrar cadena por evento:

`capturado → encolado → enviado → recibido → persistido → asociado Journey`.

### Qué falta (conceptual — NO implementar)

1. **`event_id` UUID** por punto en mapper + cola + payload.
2. Persistencia de estado por evento: `captured | queued | sent | acked`.
3. ACK backend por `event_id` o idempotency key.
4. Correlación `journey_id` + `tracking_session_id` + `event_id` en logs.
5. Contador de `intraCallbackCapturedAtSpanMs` ya existe — usarlo en pilotos para detectar batching nativo vs pérdida.
6. Logcat nativo markers para distinguir #47595 vs #47673 (upstream).

```
FILE: src/types/tracking.ts
FUNCTION: TrackingPointInput
EVIDENCE: sin event_id; identidad temporal+espacial
IMPACT: no se puede demostrar end-to-end por evento
CONFIDENCE: HIGH
```

---

## 15. Root-Cause Hypotheses

| Categoría | Evidencia | Rol |
|-----------|-----------|-----|
| **A — probable bug upstream Expo** | #46788 HIGHLY COMPATIBLE; #48935 permission ausente; #47595/#49424 POSSIBLY | Contribuyente fuerte a lifecycle/cadencia |
| **B — probable bug Rutafy** | FG puntos descartados cuando BG “activo”; ensure no reenvía options; sin event IDs; heartbeat sin cola | Amplifica fallos upstream / reduce fallback |
| **C — Android lifecycle/configuration** | FGS + BG location; OEM; RECEIVE_BOOT_COMPLETED; process death restore | Contexto necesario |
| **D — transport/retry/persistence** | Cola durable BG buena; sin backoff; at-least-once; FG memoria | Offline OK; ACK débil |
| **E — Journey association** | journey solo en start metadata; exclusión mutua mensajero | Puede ocultar puntos en Journey UI |
| **F — insuficiente evidencia** | Backend/DB; APK merged manifest; logs de los gaps 82/86.7s; device OEM | Bloquea confirmación única |

**No se selecciona una causa única sin evidencia runtime.**

### Hipótesis primaria (prioridad investigativa)

FGS/TaskManager entrega irregular o interrumpida en background (A+C), agravada porque el watch FG **no actúa de respaldo** cuando `operatorBgActive` es true (B), y la observabilidad no permite separar “no capturado” vs “no enviado” vs “no asociado” (F).

---

## 16. Recommended Actions P0–P3

**NO IMPLEMENTAR en esta auditoría.**

### P0 — antes de otro piloto

1. Verificar APK merged manifest: presencia real de `RECEIVE_BOOT_COMPLETED` (si ausente → declarar permission; alineado #48935).
2. Correr piloto instrumentado midiendo: `tracking-location-callback` spacing, `intraCallbackCapturedAtSpanMs`, `hasStartedLocationUpdatesAsync`, queue depth, batch accepted — en estacionario 10+ min.
3. En resume/hydrate: si task “started” pero `gps_gap` > umbral (p.ej. 60s), **stop+start** controlado (workaround #47595/#46788) — validar antes en staging.
4. Confirmar Android version devices piloto (¿16?).

### P1 — confiabilidad

1. Reenviar options de location al restored process (workaround #46788).
2. Evaluar patch/upgrade `expo-location` / `expo-task-manager` cuando el fix Number-coercion y JobScheduler estén en release 56.x/57.x.
3. Considerar no descartar FG points cuando BG activo **o** watchdog que reinicie BG si stale.
4. Introducir durable queue también para FG o unificar canal.

### P2 — observabilidad

1. `event_id` UUID por punto.
2. ACK/idempotency en contrato batch.
3. Export diagnóstico ya existente (`buildTrackingDiagnosticExport`) como artefacto obligatorio post-piloto.

### P3 — optimización

1. Backoff explícito de drain.
2. Ajuste fino time/distance tras confirmar cadencia nativa real.
3. Reducir at-least-once con idempotency server-side.

### Recomendación explícita de versiones

| Opción | Recomendación |
|--------|---------------|
| Mantener versiones actuales | Solo si P0 permission+watchdog se valida y gaps desaparecen |
| Patch puntual | Preferible corto plazo (permission + restore options + stale restart) |
| Actualizar expo-location | **Sí investigar** hacia release que incluya fix #46788 / FGS |
| Actualizar Expo SDK | Evaluar tras changelog 56→57/58 fixes task-manager |
| Modificar lifecycle | Sí (ensure/restore), mínimo |
| Introducir durable queue | Ya existe BG; extender FG / unificar |
| Introducir event IDs | **Sí** (P2, alto valor forense) |

---

## 17. Exact Files Inspected

### Config / lock

- `package.json`
- `package-lock.json`
- `app.json`
- `app.config.js`
- `eas.json`
- `.env.example`
- `AGENTS.md`

### Docs

- `docs/tracking.md`
- `docs/gps-tracking.md` (referenciado)
- `docs/api-integration.md`
- `docs/builds.md`
- `docs/getting-started.md`

### Core telemetry

- `src/app/_layout.tsx`
- `src/services/operatorTrackingTask.ts`
- `src/services/operatorTrackingService.ts`
- `src/services/backgroundLocationTask.ts`
- `src/services/backgroundLocationService.ts`
- `src/services/trackingSessionService.ts`
- `src/services/locationService.ts`
- `src/services/trackingDiagnostics.ts` (parcial)
- `src/hooks/useOperatorTrackingSession.ts`
- `src/hooks/useMessengerLocationHeartbeat.ts`
- `src/hooks/useMensajeroOperationalBootstrap.ts`
- `src/storage/operatorTrackingPendingQueue.ts`
- `src/storage/trackingSessionStorage.ts`
- `src/utils/trackingPointMapper.ts`
- `src/utils/operatorTrackingPendingQueueLogic.ts`
- `src/utils/trackingGapClassifier.ts`
- `src/utils/trackingGapThresholds.ts`
- `src/utils/trackingTemporalGuard.ts`
- `src/utils/trackingTemporalThresholds.ts`
- `src/utils/trackingPipelineObserver.ts`
- `src/utils/operatorTrackingFinalization.ts`
- `src/utils/operatorTrackingGuards.ts`
- `src/utils/mensajeroStartFlow.ts`
- `src/utils/mensajeroBootstrapPolicy.ts`
- `src/api/endpoints.ts`
- `src/api/client.ts`
- `src/config/env.ts`
- `src/types/tracking.ts`
- `src/types/operationalBootstrap.ts`
- `src/utils/traceId.ts`

### No encontrado / no verificable

- `AndroidManifest.xml` fuente
- `node_modules` / fuentes Kotlin expo-location
- Código backend / DB / migrations
- APK mergeado staging/production
- Logs runtime de los gaps 82/86.7s

### Upstream consultado (web)

- Expo docs Location SDK 56
- GitHub expo/expo issues #47595, #46788, #48935, #49424

---

## 18. Open Questions

1. ¿El APK staging mergeado incluye `RECEIVE_BOOT_COMPLETED` por alguna otra vía?
2. ¿Los gaps ~82/86.7s ocurrieron con `operatorBgActive=true` y FGS notification visible?
3. ¿Device Android 14 vs 16? ¿OEM (Samsung/OneUI)?
4. ¿Hubo process death / update de app inmediatamente antes?
5. ¿`intraCallbackCapturedAtSpanMs` y `locationCallbacks` del piloto muestran callbacks ausentes o solo batch HTTP diferido?
6. ¿El backend deduplica por `(session_id, captured_at, lat, lng)` o inserta siempre?
7. ¿Journey UI filtra por `observed_at`/`captured_at` o por `received_at`?
8. ¿Staging usa la misma `EXPO_PUBLIC_API_URL` efectiva que el piloto que reportó gaps?
9. ¿Durante los gaps, `hasStartedLocationUpdatesAsync` seguía true?
10. ¿Coexistencia con servicio mensajero (exclusión mutua) en esos intervalos?

---

## Appendix A — Parámetros exactos `startLocationUpdatesAsync`

### Operator (`operatorTrackingService.ts`)

| Parámetro | Valor |
|-----------|-------|
| accuracy | `Location.Accuracy.High` |
| timeInterval | `20000` |
| distanceInterval | `10` |
| deferredUpdatesInterval | `20000` |
| deferredUpdatesDistance | `10` |
| pausesUpdatesAutomatically | `false` |
| activityType | **NOT EXPLICITLY CONFIGURED** |
| foregroundService.notificationTitle | `'Captura logística activa'` |
| foregroundService.notificationBody | `'Rutafy está registrando ubicación operativa.'` |
| killServiceOnDestroy | **NOT EXPLICITLY CONFIGURED** |
| showsBackgroundLocationIndicator | **NOT EXPLICITLY CONFIGURED** |

### Mensajero (`backgroundLocationService.ts`)

| Parámetro | Valor |
|-----------|-------|
| accuracy | `Location.Accuracy.Balanced` |
| timeInterval | `30000` |
| distanceInterval | `25` |
| deferredUpdatesInterval | **NOT EXPLICITLY CONFIGURED** |
| deferredUpdatesDistance | **NOT EXPLICITLY CONFIGURED** |
| pausesUpdatesAutomatically | `false` |
| activityType | **NOT EXPLICITLY CONFIGURED** |
| foregroundService | título/body servicio activo |
| killServiceOnDestroy | **NOT EXPLICITLY CONFIGURED** |
| showsBackgroundLocationIndicator | **NOT EXPLICITLY CONFIGURED** |

### Foreground watches

| Call site | accuracy | timeInterval | distanceInterval |
|-----------|----------|--------------|------------------|
| `useOperatorTrackingSession` | Balanced | 20000 | 10 |
| `useMessengerLocationHeartbeat` | Balanced | 10000 | 10 |

### TaskManager inventory

| Task name | File | defineTask scope | Import guarantee |
|-----------|------|------------------|------------------|
| `rutafy-operator-tracking` | `operatorTrackingTask.ts` | module top-level `if (!isTaskDefined)` | `_layout.tsx` side-effect import |
| `rutafy-background-location` | `backgroundLocationTask.ts` | module top-level `if (!isTaskDefined)` | `_layout.tsx` side-effect import |

- `TaskManager.isTaskRegisteredAsync` / `getRegisteredTasksAsync` / `unregisterTaskAsync`: **no usados** en el código.
- Tras reboot: depende de OS + permission boot; app reopen rehidrata sesión.
- Riesgo FGS activo sin callbacks: **SÍ**, por diseño de ensure early-return + issues upstream.

### Identidad / timestamps

| Campo | Presente | Origen |
|-------|----------|--------|
| event_id / telemetry_event_id / UUID punto | NO | — |
| sequence_number | NO | — |
| captured_at | SÍ | device (`location.timestamp` → ISO) |
| observed_at | NO (nombre) | equivalente ≈ `captured_at` |
| sent_at | NO persistido por evento | solo diagnósticos batch |
| received_at / persisted_at | NO en cliente | server UNKNOWN |

Journey reconstruction en cliente (`trackingSessionFormat`) ordena por `captured_at` — correcto respecto a tiempo de observación del device, no por recepción.

---

---

## Control de exportación

| Ítem | Valor |
|------:|:------|
| Archivo | `TELEMETRY_ANDROID_FORENSIC_AUDIT.md` |
| Generado | 2026-10-02 |
| Método | Auditoría READ-ONLY del repositorio |
| Secretos | No incluidos |
| Backend | NOT VERIFIABLE READ-ONLY (fuera de repo) |

*Fin del informe exportable. Auditoría read-only; sin cambios a STAGING ni PRODUCTION.*
