# Auditoría: velocidad y movimiento operacional (Rutafy Android)

**Fecha:** 2026-09-14  
**Modo:** solo lectura (sin cambios de código en el pipeline)  
**Alcance:** captura logística (`rutafy-operator-tracking` + watch foreground)  
**Dictamen:** **READY TO IMPLEMENT**

---

## Contexto

Sesión de campo (Motorola moto g47, Android 16, ~22 min 43 s):

| Métrica | Valor |
|---|---|
| Fixes recibidos / válidos / mapeados | 97 / 96 / 96 |
| Lotes aceptados | 41/41 |
| Native speed = 0 | 84/96 |
| Ceros recuperados vía derived | 20 |
| Sin velocidad efectiva | 64/96 |
| Estados UNKNOWN | 70/96 |
| Max derived bruto / good / efectiva | 576 / 123 / 101 km/h |
| Cobertura acelerómetro | 0,316 % |
| Callbacks agrupados | hasta 3 locs; span máx. ~65 s |

---

## Veredicto en una frase

El estimador de velocidad/movimiento es razonable como lógica pura, pero está **mal alimentado**: corre en el mapeo **antes** de deduplicar, con foreground y background alimentando el mismo `previousFix`, y con callbacks multi-location sin ordenar.

---

## Pipeline actual (captura logística)

```
FG: watchPositionAsync (Balanced, 20s, 10m)
  → toTrackingPoint → speed/motion/pipeline
  → si BG activo: no buffer (pero ya observó)
  → si no: buffer → batch

BG: startLocationUpdatesAsync (High, 20s, 10m + deferred 20s/10m)
  → TaskManager → locationsToTrackingPoints
  → mismo toTrackingPoint → speed/motion/pipeline
  → cola durable (dedupe AQUÍ) → batch
```

**Inicio FG:** `src/hooks/useOperatorTrackingSession.ts` → `startWatch`  
**Inicio BG:** `src/services/operatorTrackingService.ts` → `startOperatorTrackingAsync`  
**Task:** `src/services/operatorTrackingTask.ts` (`rutafy-operator-tracking`)

Hay un segundo sistema GPS (mensajero → heartbeat) que **no** participa en el estimador de velocidad de captura.

---

## Hipótesis comprobadas

| # | Hipótesis | Resultado |
|---|---|---|
| 1 | FG y BG procesan por caminos separados | **Parcial:** envío separado; observación compartida |
| 2 | Mismo fix puede mapearse dos veces antes de dedup | **Confirmada** |
| 3 | Dedup tarde / solo en cola de envío | **Confirmada** |
| 4 | Multi-location no siempre ordenado por `capturedAt` | **Confirmada** |
| 5 | Native 0 válido aunque haya desplazamiento | **Confirmada** (con recovery si derived ≥ 10 km/h) |
| 6 | Velocidad usa último punto aunque sea duplicado | **Confirmada** → `invalid_delta_time` |
| 7 | Acelerómetro no activo en background | **Confirmada** |
| 8 | Varias fuentes de verdad velocidad/movimiento | **Confirmada** |
| 9 | Config Expo favorece batching / intervalos largos | **Confirmada** (deferred BG) |
| 10 | Distingue mal 0 vs desconocida | **Mayormente refutada** en parse; riesgo residual OS |

### Coherencia 96 mapeados vs ~52 BG

Con BG activo, FG mapea y observa pero no envía. El mismo fix físico puede incrementar `pointsMapped` dos veces y encolarse una sola vez. Eso explica el desfase mapeados vs confirmados por background.

---

## Causas probables

### `speed = 0` nativo (84/96)

Android/Expo entrega `coords.speed = 0` con frecuencia. El mapper lo conserva. La fusión solo recupera si derived es **good ≥ 10 km/h**; si no → effectiveSpeed unavailable → motion **UNKNOWN**.

### `invalid_delta_time`

`calculateDerivedSpeedSample` rechaza `deltaTimeMs <= 0`. Ocurre cuando:

- el mismo fix llega por FG y luego BG (mismo `captured_at`);
- un callback multi-location llega desordenado;
- un duplicado exacto actualiza `previousFix` y contamina el siguiente par.

### Picos derived (576 km/h)

Distancia/tiempo sobre gaps largos (deferred batching) + sin sort previo + sin filtro de aceleración.

---

## Archivos clave

| Rol | Archivo |
|---|---|
| Watch FG | `src/hooks/useOperatorTrackingSession.ts` |
| Start BG | `src/services/operatorTrackingService.ts` |
| Task BG | `src/services/operatorTrackingTask.ts` |
| Mapper | `src/utils/trackingPointMapper.ts` |
| Derived / native | `src/utils/speedTelemetry.ts` |
| Observer + `previousFix` | `src/utils/speedTelemetryObserver.ts` |
| Quality gate | `src/utils/speedQualityGate.ts` |
| Fusión effective | `src/utils/effectiveSpeedFusion.ts` |
| Motion state | `src/utils/motionStateMachine.ts` |
| Dedupe cola | `src/utils/operatorTrackingPendingQueueLogic.ts` |
| Acelerómetro FG-only | `src/services/motionTelemetryService.ts` |

---

## Propuesta: Operational Speed and Motion Estimator v1

### Arquitectura mínima

1. **Ingesta única** — FG y BG alimentan un normalizador compartido; un solo `lastAcceptedFix`.
2. **Orden cronológico** — sort por `capturedAt` antes de estimar; rechazar out-of-order sin alterar la referencia válida.
3. **Dedupe previa** — antes de velocidad, motion y `pointsMapped`; clave estable + tolerancia tiempo/coords.
4. **Selección de velocidad** — `nativeSpeedKmh`, `derivedSpeedKmh`, `operationalSpeedKmh`, `speedSource`, `speedConfidence`, `speedReason`.
5. **Filtros** — accuracy, desplazamiento/incertidumbre, delta temporal, plausibilidad, aceleración, mediana móvil, EMA.
6. **Motion** — `MOVING` / `STATIONARY` / `UNKNOWN` con histéresis; distinguir **speed = 0** vs **speed desconocida**.
7. **Observabilidad** — duplicados, out-of-order, callbacks agrupados, ceros recuperados, rechazos, cobertura, fuente/confianza.

### Restricciones de diseño (fase 1)

- No navegación completa / map matching global  
- No integrar acelerómetro a velocidad  
- No cambiar contrato backend  
- Conservar `speed_mps` crudo  
- No romper envío batch  
- Funciones puras testeables sin GPS real  

### Impacto backend

**Ninguno en fase 1.** Solo mejora local de estimación y métricas; el payload batch permanece igual.

---

## Plan de implementación (pasos pequeños)

1. Módulo puro del estimador + tipos  
2. Sort + dedupe compartidos + tests con fixtures de la sesión de campo  
3. Cablear ingesta única (FG/BG → mismo ingest)  
4. Con BG activo: FG no alimenta el estimador  
5. Motion consume solo `operationalSpeed` post-dedupe  
6. Métricas nuevas de observabilidad  
7. Sesión de campo de validación (≥20 min, mismo dispositivo)  
8. Ajuste de `deferredUpdates*` / intervalos solo con evidencia  

---

## Pruebas pendientes (gaps actuales)

- No hay Jest/Vitest; solo `scripts/validate-*.mjs` que **duplican** lógica (riesgo de drift).  
- Falta: FG+BG concurrente, sort previo a derived, dedupe pre-speed, wiring accel→motion.  
- `stale_fix` está tipado pero el quality gate solo setea un flag, no el reason.

---

## Qué no tocar en fase 1

- Backend, contratos API, migraciones  
- Task mensajero (`rutafy-background-location`)  
- Campo `speed_mps` del payload  
- Semántica de cola durable / flush  
- Prebuild / EAS / `android/` / `ios/` sin evidencia post-estimador  

---

## Dictamen

**READY TO IMPLEMENT**

Hay evidencia de código suficiente. La captura de campo confirma el modelo causal; no lo contradice. La calibración fina de umbrales es iterativa post-v1, no un bloqueo de diseño.
