# Adenda — Revisión previa a implementación

**Fecha:** 2026-09-16  
**Modo:** solo lectura (sin cambios de código en el pipeline)  
**Alcance:** captura logística — decisiones previas a implementar el Estimator v1  
**Dictamen:** **READY TO IMPLEMENT — solo Fase A**

Documento complementario a [`operational-speed-motion-audit.md`](./operational-speed-motion-audit.md).

---

## 1. Decisiones definitivas

### 1.1 Causa de picos (corrección)

La fórmula en `calculateDerivedSpeedSample` (`src/utils/speedTelemetry.ts`) es:

```text
speedDerivedKmh = (distanceM / deltaTimeMs) * 3600
```

Un **gap temporal largo baja** la velocidad (aumenta el denominador). El quality gate clasifica `deltaTimeMs > 60_000` como `long_gap` (`src/utils/speedQualityGate.ts`), no como pico.

| Origen posible | ¿Ocurre en el código? | Mecanismo |
|---|---|---|
| **Delta temporal corto** | **Sí — principal** | No hay `MIN_DELTA`. Cualquier `deltaTimeMs > 0` calcula. Ej.: 16 m / 100 ms ≈ 576 km/h |
| **Puntos fuera de orden** | **Sí** | `locationsToTrackingPoints` no ordena; `commitPreviousFix` siempre; el siguiente par puede tener delta corto + distancia grande |
| **Duplicado exacto** | Produce `invalid_delta_time`, **no** pico | `delta <= 0` → reject; igual contamina al hacer commit |
| **Casi-duplicado** (Δt > 0, coords distintas) | **Sí → pico** | FG/BG o ruido GPS con timestamps cercanos |
| **Salto GPS** | **Sí** | Distancia grande / delta corto o normal → bruto alto; luego `implausible_speed` si > 160 |
| **Mezcla `previousFix` FG/BG** | **Sí** | Singleton de módulo en `speedTelemetryObserver.ts`; ambos llaman `toTrackingPoint` → `observeSpeedTelemetryFromPoint` |
| **`capturedAt` vs `receivedAt`** | **No en la fórmula** | Derived usa solo `captured_at` / `previous.capturedAtMs`. `Date.now()` solo entra en `fixAgeMs` (stale) y como fallback de `captured_at` si **no** hay sesión activa |
| **Deferred batching “por gap largo”** | **No** | No explica picos vía denominador |
| **Deferred batching como facilitador** | **Indirecto** | Aumenta callbacks multi-location → más exposición a desorden / pares cercanos en tiempo |

**Conclusión:** los picos que el código puede generar son de clase **numerador/denominador corto** (salto GPS, casi-duplicado, desorden + commit). No atribuir el 576 km/h a “gap largo por deferred”.

> Nota: el repo no conserva el evento concreto con `deltaTimeMs` / `distanceFromPreviousM` de ese pico de campo; `speed-stat-derived` sí registra ambos. La clase causal queda demostrada por código.

### 1.2 Fuente autoritativa (política explícita)

**Política adoptada:**

1. **BG autoritativo** cuando el TaskManager operator está activo (`isOperatorTrackingStartedAsync` / `operatorBgActive === true`).
2. **FG autoritativo solo** cuando BG no está activo.
3. **FG observe-only** con BG activo: puede construir punto / UI / logs locales **sin** mutar `previousFix` / `lastAcceptedFix`, motion state ni contadores operacionales (`pointsMapped`, speed stats de sesión, etc.).

**Compatible con el lifecycle actual:** sí.

- Start: BG primero, luego watch (`useOperatorTrackingSession`, ~L602–609).
- Con BG on, FG ya hace early-return **después** de mapear (~L324–331); hoy muta estimador — la política exige mover el gate **antes** de mutar estado operacional.
- Si BG falla al arrancar, FG sigue siendo la única fuente de buffer/envío.
- Docs (`docs/tracking.md` §1.3): BG es fuente primaria cuando activo.

**Resolución de la contradicción:** no hay un “mismo ingest que muta dos veces”. Hay **un solo pipeline de estimación**, con **un owner** por instante; el otro canal como máximo observa en modo no mutante.

### 1.3 Serialización por sesión

Patrón ya usado en el repo: **promise chain** (`serializeMutation` en `operatorTrackingPendingQueue.ts` y espejo en `createSerializedMutationRunner`).

**Diseño:**

- Un `IngestCoordinator` por proceso, scoped por `sessionId`.
- Entry point único: `enqueueIngest(sessionId, locations, role)`.
- Cadena: `mutationChain.then(processBatch)` — una operación de ingest a la vez.
- Dentro del batch: sort → validate → exact dedupe → estimate → update `lastAcceptedFix` / motion **solo si `role = authoritative`**.
- Reset en start/hydrate y en cleanup/end (símbolos `reset*` ya existentes).
- No hace falta mutex nativo: JS es single-thread; la cadena cubre interleaving en `await` entre TaskManager y el watch.

### 1.4 Dedupe conservador

| Caso | Regla | ¿Actualiza `lastAcceptedFix`? |
|---|---|---|
| **Duplicado exacto** | Misma clave `sessionId\|captured_at\|lat\|lng` (coords normalizadas a string estable) | No |
| **Fuera de orden** | `capturedAtMs < lastAccepted.capturedAtMs` | No (métrica `out_of_order`) |
| **Estacionario legítimo** | Mismas/casi mismas coords, **`captured_at` distinto** | Sí — samples de dwell |

**Fase A:** solo dedupe **exacto** (como la cola BG, más `sessionId` en la clave lógica).

**Dedupe aproximado:** solo en fase posterior, y solo con criterios estrictos que no colapsen permanencias — **no** en Fase A.

### 1.5 `speed_mps` y backend

| Pregunta | Respuesta con evidencia |
|---|---|
| ¿Qué contiene `speed_mps`? | **Solo native** `coords.speed` (m/s). Mapper en `trackingPointMapper.ts` |
| ¿Qué recibe el backend en top-level? | Ese `speed_mps` nativo (o `null`) vía `points[]` en batch |
| ¿Derived/effective en top-level? | **No** |
| ¿Ya viaja telemetría? | **Sí, en `metadata`:** `effective_speed_kmh`, source/confidence/reason, `motion_state` (`trackingTelemetryEnrichment.ts`) |
| ¿`operationalSpeed` en Fase A/B? | **Solo local + metadata aditiva**; no redefinir `speed_mps` |
| ¿Mejorar backend sin cambiar contrato? | Sí: consumir `metadata.effective_*` / futuro `operational_*` si ya persiste `metadata` |
| ¿Reutilizar `speed_mps` con otra semántica? | **No en Fase A.** Consumidores: native parse del observer, diagnostics, pipeline snapshot, logs BG, shape legacy |

### 1.6 Arquitectura mínima por fases

| Fase | Alcance | ¿Autorizada? |
|---|---|---|
| **A** | Ownership FG/BG · sort · dedupe exacto pre-estimador · serialización · no-commit en duplicate/out-of-order · métricas | **Sí** |
| **B** | Filtros de velocidad (MIN_DELTA, accel) · histéresis motion bien alimentada · mediana/EMA | No aún |
| **C** | Persistencia operacional explícita en backend · corredor / map matching | Futura |

---

## 2. Archivos y símbolos involucrados

| Área | Archivo | Símbolos |
|---|---|---|
| Fórmula / picos | `src/utils/speedTelemetry.ts` | `calculateDerivedSpeedSample`, `haversineDistanceM` |
| Estado mutable | `src/utils/speedTelemetryObserver.ts` | `previousFix`, `commitPreviousFix`, `observeSpeedTelemetryFromPoint` |
| Mapper / payload | `src/utils/trackingPointMapper.ts` | `toTrackingPoint`, `locationsToTrackingPoints` |
| Quality | `src/utils/speedQualityGate.ts` | `assessSpeedSampleQuality`, `MAX_DERIVED_GAP_MS` |
| Enrichment | `src/utils/trackingTelemetryEnrichment.ts` | `enrichTrackingPointTelemetry` |
| Ownership FG | `src/hooks/useOperatorTrackingSession.ts` | `startWatch`, `operatorBgActiveRef`, `startOperatorBackground` |
| Ownership BG | `src/services/operatorTrackingService.ts` | `startOperatorTrackingAsync`, `isOperatorTrackingStartedAsync` |
| Task BG | `src/services/operatorTrackingTask.ts` | task handler, `locationsToTrackingPoints` |
| Dedupe cola (tarde) | `src/utils/operatorTrackingPendingQueueLogic.ts` | `pointDedupeKey`, `mergePendingPoints`, `sortPointsByCapturedAt` |
| Serialización existente | `src/storage/operatorTrackingPendingQueue.ts` | `serializeMutation` |
| Reset sesión | observers + `trackingSessionOwnership` | `reset*` |
| Contrato tipos | `src/types/tracking.ts`, `trackingTelemetry.ts` | `TrackingPointInput.speed_mps`, metadata fields |
| Transporte | `trackingSessionService.sendTrackingPointsBatch`, task `postPointsBatch` | body `{ points }` |

---

## 3. Flujo antes / después

### Antes

```text
FG callback ─┐
             ├─→ toTrackingPoint → observe+commit previousFix → point-mapped
BG locations─┘                      (sin sort / sin dedupe)
                                      │
                    FG+BG activos: FG return sin buffer
                    BG: enqueue (dedupe aquí) → batch
```

### Después (Fase A)

```text
FG callback ──→ enqueueIngest(role=observe|authoritative)
BG locations ─→ enqueueIngest(role=authoritative)   // si task started
                      │
              serializeMutation(sessionId)
                      │
         sort(capturedAt) → exact dedupe → validate
                      │
         if authoritative:
           estimate → update lastAcceptedFix/motion → map metrics
         else:
           optional UI snapshot (no commit)
                      │
         transport unchanged (FG buffer | BG queue)
```

---

## 4. Semántica exacta de `speed_mps`

1. **Origen:** `LocationObject.coords.speed` (Expo/Android), unidades **m/s**.
2. **Normalización:** finito y `>= 0` → se copia; `null`/NaN/negativo → `null`. El **0 se conserva** (cero nativo válido).
3. **No es:** derived, effective ni operational.
4. **Payload batch:** top-level `speed_mps` = native; `metadata` puede llevar `effective_speed_*` y `motion_state` sin alterar el campo legacy.
5. **Fase A/B:** `operationalSpeed*` vive en estimador local (± metadata aditiva); **nunca** sobrescribe `speed_mps`.

---

## 5. Pseudocódigo de ingesta serial

```text
type Role = 'authoritative' | 'observe'

let chains = Map<sessionId, Promise>
let state  = Map<sessionId, { lastAccepted, seenExactKeys, motion }>

function enqueueIngest(sessionId, locations, role): Promise<Result[]> {
  const run = () => processBatch(sessionId, locations, role)
  const next = (chains.get(sessionId) ?? Promise.resolve()).then(run, run)
  chains.set(sessionId, next.then(() => {}, () => {}))
  return next
}

function processBatch(sessionId, locations, role):
  pts = filterValidCoords(locations)
  pts = sortByCapturedAtAsc(pts)
  out = []
  for p in pts:
    key = `${sessionId}|${p.captured_at}|${p.lat}|${p.lng}`
    if seenExactKeys.has(key):
      metrics.exact_duplicate++; continue
    if state.lastAccepted && p.capturedAtMs < state.lastAccepted.capturedAtMs:
      metrics.out_of_order++; continue   // no commit

    if role == 'observe':
      optionalUiSnapshot(p); continue

    // authoritative
    sample = estimate(state.lastAccepted, p)  // may be null on first
    stepMotion(sample)
    commit lastAccepted = p
    seenExactKeys.add(key)
    enrichMetadataAdditive(p, sample)  // speed_mps untouched
    out.push(p)
    metrics.points_mapped_operational++
  return out

onSessionStart(sessionId): reset state[sessionId]; reset observers
onSessionEnd(sessionId):   reset state; clear chain tail
```

---

## 6. Plan de pruebas (módulos reales)

**Requisito:** importar `src/utils/*` reales. **Prohibido** duplicar lógica como hacen hoy `scripts/validate-*.mjs`.

| Caso | Qué assert |
|---|---|
| Duplicado FG/BG exacto | 1 sola mutación de `lastAccepted`; 1 mapped operacional |
| Mismo timestamp, coords iguales | exact dedupe; no `invalid_delta` contaminante |
| Callback desordenado | sort restaura orden; sin commit out-of-order |
| Callback acumulado (span 65s, 3 locs) | orden cronológico; deltas coherentes |
| Native 0 + movimiento (derived good) | recovery / operational > 0; no STATIONARY |
| Native 0 + estacionario | operational 0 o UNKNOWN distinto; no falso MOVING |
| Salto GPS (Δx grande, Δt corto) | bruto alto rechazado; no actualiza operational “good” |
| Fuera de orden residual | métrica; `lastAccepted` intacto |
| Cambio de sesión | reset; no cruza previous |
| Callbacks concurrentes (promise chain) | orden serial; estado final determinista |
| Cierre con cola pendiente | drain policy existente + reset estimador post-end |

Infra sugerida: runner TypeScript (p. ej. `tsx` / vitest mínimo **solo para tests**), sin tocar runtime de la app.

---

## 7. Riesgos

1. Si FG observe-only sigue llamando `point-mapped` / speed-stat, las métricas de sesión seguirán infladas — separar contadores **operacionales** vs **diagnóstico de canal**.
2. `operatorBgActiveRef` puede desfasarse vs task real; preferir `isOperatorTrackingStartedAsync` (o flag confirmado) para ownership.
3. Dedupe aproximado prematuro → pérdida de dwell stationary.
4. Sobrescribir `speed_mps` rompería contrato y consumidores nativos.
5. Promise chain no serializa el hilo nativo de Location; solo el ingest JS — suficiente para `previousFix`.
6. Scripts `validate-*.mjs` actuales seguirán dando falsa confianza hasta migrarlos a imports reales.

---

## 8. Dictamen actualizado

### **READY TO IMPLEMENT — solo Fase A**

Bloqueos de diseño de la auditoría inicial quedan resueltos con esta adenda:

- Causa de picos reclasificada (delta corto / desorden / salto / mezcla FG-BG; no gap largo).
- Ownership FG/BG explícito y alineado al lifecycle.
- Serialización = promise chain por `sessionId` (patrón ya en repo).
- Dedupe Fase A = exacto; aproximado diferido.
- `speed_mps` = native only; operational en local/metadata.

**Fase B/C no autorizadas** en este paso.
