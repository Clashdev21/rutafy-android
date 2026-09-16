import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import axios from 'axios';

import type { AuthUser } from '../src/types/auth.ts';
import { formatBogotaDayParam, getBogotaDayRangeUtc } from '../src/utils/bogotaDayRange.ts';
import {
  buildOperationalControlListParams,
  CONTROL_DEFAULT_PROGRAM_CODE,
  CONTROL_LIST_LIMIT,
} from '../src/utils/controlMobileQuery.ts';
import {
  asSafeText,
  deriveControlKpis,
  filterControlUnits,
  mapControlContainers,
  mapEtaForDisplay,
  mapRiskForDisplay,
  mapTwinTimeline,
} from '../src/utils/controlMobileDisplay.ts';
import { resolveControlUiError } from '../src/utils/controlMobileErrors.ts';
import {
  isPresentationHiddenField,
  shouldShowControlField,
} from '../src/utils/controlMobilePresentation.ts';
import { getHomeHrefForUser, isRestorableMobileUser } from '../src/utils/roles.ts';

function makeUser(appRole: AuthUser['appRole'], actorId: string | null): AuthUser {
  return {
    id: '1',
    user_id: 'u-1',
    name: 'Operador',
    email: null,
    phone: '3000000000',
    role: appRole.toLowerCase(),
    appRole,
    actor_id: actorId,
    actor_type:
      appRole === 'MENSAJERO' ? 'messenger' : appRole === 'TRANSPORTISTA' ? 'transporter' : null,
  };
}

describe('TEST 1 — ADMIN → home /control', () => {
  it('enruta ADMIN a Control Mobile aunque no tenga actor_id', () => {
    const admin = makeUser('ADMIN', null);
    assert.equal(getHomeHrefForUser(admin), '/control');
    assert.equal(isRestorableMobileUser(admin), true);
  });
});

describe('TEST 2 — MENSAJERO → home mensajero sin cambios', () => {
  it('enruta MENSAJERO a /mensajero', () => {
    const mensajero = makeUser('MENSAJERO', 'msg-1');
    assert.equal(getHomeHrefForUser(mensajero), '/mensajero');
    assert.notEqual(getHomeHrefForUser(mensajero), '/control');
  });

  it('sigue exigiendo actor_id', () => {
    assert.equal(isRestorableMobileUser(makeUser('MENSAJERO', null)), false);
    assert.equal(isRestorableMobileUser(makeUser('MENSAJERO', '   ')), false);
  });
});

describe('TEST 3 — TRANSPORTISTA → home transportista sin cambios', () => {
  it('enruta TRANSPORTISTA a /transportista', () => {
    const transportista = makeUser('TRANSPORTISTA', 'co-1');
    assert.equal(getHomeHrefForUser(transportista), '/transportista');
    assert.notEqual(getHomeHrefForUser(transportista), '/control');
  });

  it('sigue exigiendo actor_id', () => {
    assert.equal(isRestorableMobileUser(makeUser('TRANSPORTISTA', null)), false);
  });
});

describe('TEST 4 — día Bogotá → from/to UTC correctos', () => {
  it('10 septiembre Bogotá 00:00 −05 mapea a 2026-09-10T05:00:00.000Z', () => {
    const range = getBogotaDayRangeUtc(new Date('2026-09-10T05:00:00.000Z'));
    assert.equal(range.from, '2026-09-10T05:00:00.000Z');
    assert.equal(range.to, '2026-09-11T04:59:59.999Z');
    assert.deepEqual(range.ymd, { year: 2026, month: 9, day: 10 });
  });

  it('justo antes de medianoche Bogotá (UTC 04:59) sigue en el día anterior', () => {
    const range = getBogotaDayRangeUtc(new Date('2026-09-10T04:59:59.999Z'));
    assert.equal(range.from, '2026-09-09T05:00:00.000Z');
    assert.equal(range.to, '2026-09-10T04:59:59.999Z');
    assert.deepEqual(range.ymd, { year: 2026, month: 9, day: 9 });
  });

  it('medianoche UTC no cambia el día calendario de Bogotá', () => {
    const range = getBogotaDayRangeUtc(new Date('2026-09-10T00:00:00.000Z'));
    assert.equal(range.from, '2026-09-09T05:00:00.000Z');
    assert.equal(range.to, '2026-09-10T04:59:59.999Z');
  });

  it('un instante a mediodía Bogotá conserva from/to del mismo día calendario', () => {
    const range = getBogotaDayRangeUtc(new Date('2026-09-10T17:00:00.000Z'));
    assert.equal(range.from, '2026-09-10T05:00:00.000Z');
    assert.equal(range.to, '2026-09-11T04:59:59.999Z');
  });
});

describe('TEST 4B — "Programación de hoy" usa el contrato temporal moderno', () => {
  const NOON = new Date('2026-09-15T17:00:00.000Z'); // 12:00 en Bogotá

  it('envía temporal_mode=day, day (YYYY-MM-DD Bogotá) y timezone', () => {
    const params = buildOperationalControlListParams({ now: NOON });
    assert.equal(params.temporal_mode, 'day');
    assert.equal(params.day, '2026-09-15');
    assert.equal(params.timezone, 'America/Bogota');
    assert.match(params.day, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('no envía from ni to', () => {
    const params = buildOperationalControlListParams({ now: NOON });
    const keys = Object.keys(params);
    assert.equal(keys.includes('from'), false);
    assert.equal(keys.includes('to'), false);
    assert.deepEqual(keys.sort(), [
      'day',
      'limit',
      'program_code',
      'temporal_mode',
      'timezone',
      'view',
    ]);
  });

  it('conserva view=containers, program_code y limit=100', () => {
    const params = buildOperationalControlListParams({ now: NOON });
    assert.equal(params.view, 'containers');
    assert.equal(params.program_code, 'MABE_CO');
    assert.equal(params.program_code, CONTROL_DEFAULT_PROGRAM_CODE);
    assert.equal(params.limit, 100);
    assert.equal(params.limit, CONTROL_LIST_LIMIT);
  });

  it('permite override de program_code y limit sin romper el contrato temporal', () => {
    const params = buildOperationalControlListParams({
      now: NOON,
      programCode: 'OTRO_CO',
      limit: 25,
    });
    assert.equal(params.program_code, 'OTRO_CO');
    assert.equal(params.limit, 25);
    assert.equal(params.temporal_mode, 'day');
    assert.equal(params.day, '2026-09-15');
  });

  it('day no cambia de fecha alrededor de medianoche en Bogotá', () => {
    // 23:59:59 Bogotá del 15 = 04:59:59Z del 16 → sigue siendo 2026-09-15.
    assert.equal(
      buildOperationalControlListParams({ now: new Date('2026-09-16T04:59:59.999Z') }).day,
      '2026-09-15',
    );
    // 00:00:00 Bogotá del 16 = 05:00:00Z del 16 → ya es 2026-09-16.
    assert.equal(
      buildOperationalControlListParams({ now: new Date('2026-09-16T05:00:00.000Z') }).day,
      '2026-09-16',
    );
    // Medianoche UTC no adelanta el día calendario de Bogotá.
    assert.equal(
      buildOperationalControlListParams({ now: new Date('2026-09-16T00:00:00.000Z') }).day,
      '2026-09-15',
    );
  });

  it('formatBogotaDayParam siempre produce YYYY-MM-DD con padding', () => {
    assert.equal(formatBogotaDayParam(new Date('2026-01-05T17:00:00.000Z')), '2026-01-05');
    assert.equal(formatBogotaDayParam(new Date('2026-12-31T22:00:00.000Z')), '2026-12-31');
    // 2027-01-01T02:00Z = 2026-12-31 21:00 en Bogotá → no cruza el año.
    assert.equal(formatBogotaDayParam(new Date('2027-01-01T02:00:00.000Z')), '2026-12-31');
    // Cruce de mes hacia atrás.
    assert.equal(formatBogotaDayParam(new Date('2026-10-01T03:00:00.000Z')), '2026-09-30');
  });
});

describe('TEST 5 — operational-control response → mapper mobile', () => {
  it('mapea contenedor, ruta, estado, placa y riesgo sin recalcular estado', () => {
    const units = mapControlContainers({
      view: 'containers',
      containers: [
        {
          container_id: 'TXGU5742588',
          declared_port_code: 'SPIA',
          destination_code: 'CDR_YUMBO',
          operational_state: 'EN RUTA',
          plate: 'ABC123',
          driver_name: 'Ana',
          risk_level: 'MEDIO',
          scheduled_at: '2026-09-10T12:00:00.000Z',
          updated_at: '2026-09-10T14:00:00.000Z',
        },
        {
          container_id: 'MSCU1111111',
          operational_state: 'PROGRAMADO',
        },
        {
          container_id: 'HLCU2222222',
          operational_state: 'EN PUERTO',
        },
        {
          container_id: 'TCLU3333333',
          operational_state: 'FINALIZADO',
        },
        {
          container_id: 'CMAU4444444',
          operational_state: 'ALERTA',
        },
      ],
    });

    assert.equal(units[0].containerId, 'TXGU5742588');
    assert.equal(units[0].origin, 'SPIA');
    assert.equal(units[0].destination, 'CDR_YUMBO');
    assert.equal(units[0].operationalState, 'EN RUTA');
    assert.equal(units[0].plate, 'ABC123');
    assert.equal(units[0].riskLevel, 'MEDIO');
    assert.equal(units[0].scheduledLabel.includes('NaN'), false);

    const kpis = deriveControlKpis(units);
    assert.deepEqual(
      Object.fromEntries(kpis.map((k) => [k.id, k.value])),
      {
        programadas: 1,
        en_puerto: 1,
        en_transito: 1,
        entregadas: 1,
        con_novedad: 1,
      },
    );

    const transito = filterControlUnits(units, 'en_transito', '');
    assert.equal(transito.length, 1);
    assert.equal(transito[0].containerId, 'TXGU5742588');

    const search = filterControlUnits(units, 'todos', 'abc123');
    assert.equal(search.length, 1);
  });

  it('usa plate/driver_name del backend sin caer a la identidad del messenger', () => {
    const units = mapControlContainers({
      view: 'containers',
      containers: [
        {
          container_id: 'TXGU5742588',
          operational_state: 'EN RUTA',
          // Identidad autoritativa de la declaración (contrato moderno).
          plate: 'WGY481',
          driver_name: 'Carlos Declarado',
          // Metadata secundaria: nunca debe ganar en la tarjeta.
          messenger_plate: 'ZZZ999',
          messenger_full_name: 'Otro Mensajero',
        },
      ],
    });

    assert.equal(units[0].plate, 'WGY481');
    assert.equal(units[0].driverName, 'Carlos Declarado');
    assert.notEqual(units[0].plate, 'ZZZ999');
    assert.notEqual(units[0].driverName, 'Otro Mensajero');
  });

  it('búsqueda y filtros siguen operando sobre la placa declarada', () => {
    const units = mapControlContainers({
      containers: [
        {
          container_id: 'TXGU5742588',
          operational_state: 'EN RUTA',
          plate: 'WGY481',
          driver_name: 'Carlos Declarado',
          messenger_plate: 'ZZZ999',
        },
        { container_id: 'MSCU1111111', operational_state: 'PROGRAMADO', plate: 'AAA111' },
      ],
    });

    assert.equal(filterControlUnits(units, 'todos', 'wgy481').length, 1);
    assert.equal(filterControlUnits(units, 'todos', 'WGY').length, 1);
    assert.equal(filterControlUnits(units, 'todos', 'TXGU').length, 1);
    // La placa del messenger no es indexable en la búsqueda.
    assert.equal(filterControlUnits(units, 'todos', 'ZZZ999').length, 0);
    assert.equal(filterControlUnits(units, 'en_transito', '').length, 1);
    assert.equal(filterControlUnits(units, 'programados', '').length, 1);
    assert.equal(filterControlUnits(units, 'todos', '').length, 2);
  });

  it('no reinterpreta ESPERANDO GPS / ESPERANDO MOVIMIENTO en los KPIs v1', () => {
    const units = mapControlContainers({
      containers: [
        { container_id: 'A', operational_state: 'ESPERANDO GPS' },
        { container_id: 'B', operational_state: 'ESPERANDO MOVIMIENTO' },
        { container_id: 'C', operational_state: 'PROGRAMADO' },
      ],
    });
    const kpis = Object.fromEntries(deriveControlKpis(units).map((k) => [k.id, k.value]));
    assert.equal(kpis.programadas, 1);
    assert.equal(kpis.en_puerto, 0);
    assert.equal(kpis.en_transito, 0);
    assert.equal(filterControlUnits(units, 'todos', '').length, 3);
    assert.equal(filterControlUnits(units, 'programados', '').length, 1);
    assert.equal(filterControlUnits(units, 'en_transito', '').length, 0);
  });
});

describe('TEST 6 — unknown/null fields → UI segura', () => {
  it('omite filas sin container_id y no produce undefined/NaN', () => {
    const units = mapControlContainers({
      containers: [
        {
          container_id: null,
          operational_state: null,
          match_score: Number.NaN,
          scheduled_at: 'no-es-fecha',
        },
        {
          container_id: '  ',
          destination_code: undefined,
        },
        {
          container_id: 'OKU123',
          operational_state: null,
          plate: null,
          driver_name: null,
          risk_level: null,
          scheduled_at: null,
          updated_at: null,
        },
      ],
    });

    assert.equal(units.length, 1);
    assert.equal(units[0].containerId, 'OKU123');
    assert.equal(units[0].origin, '—');
    assert.equal(units[0].destination, '—');
    assert.equal(units[0].operationalState, 'Sin estado');
    assert.equal(units[0].plate, null);
    assert.equal(units[0].scheduledLabel, 'Sin horario');
    assert.equal(units[0].lastUpdateLabel, 'Sin actualización');
    assert.equal(String(units[0].scheduledLabel).includes('undefined'), false);
    assert.equal(String(units[0].lastUpdateLabel).includes('NaN'), false);
  });

  it('ETA/riesgo/timeline nulos no rompen el mapper', () => {
    assert.equal(asSafeText(undefined), '—');
    assert.equal(asSafeText(Number.NaN), '—');

    const eta = mapEtaForDisplay(null);
    assert.equal(eta.available, false);
    assert.equal(eta.label, 'ETA no disponible');

    const expired = mapEtaForDisplay({
      label: 'ETA vencido',
      eta_at: '2026-09-10T10:00:00.000Z',
      is_expired: true,
      source_label: 'Programación logística vencida',
    });
    assert.equal(expired.expired, true);
    assert.equal(expired.label, 'ETA vencido');

    const risk = mapRiskForDisplay(null);
    assert.equal(risk.levelLabel, 'Normal');
    assert.deepEqual(risk.reasons, []);
    assert.equal(risk.score, null);

    const timeline = mapTwinTimeline({
      current_phase_label: 'En tránsito hacia CDR',
      declared_truth: { scheduled_at: '2026-09-10T12:00:00.000Z' },
      timeline: [
        { event_type: 'IN_TRANSIT', detected_at: '2026-09-10T15:00:00.000Z', time: '10:00' },
        { event_type: null, detected_at: null },
      ],
    });
    assert.equal(timeline[0].label, 'Programado');
    assert.equal(timeline.some((item) => item.label === 'En tránsito hacia CDR'), true);
    assert.equal(timeline.every((item) => typeof item.atLabel === 'string' && item.atLabel !== 'undefined'), true);
  });

  it('errores de red/403 no exponen JSON crudo', () => {
    const forbidden = new axios.AxiosError('Request failed');
    forbidden.response = {
      status: 403,
      data: { error: 'forbidden', trace_id: 'T-1' },
      statusText: 'Forbidden',
      headers: {},
      config: { headers: {} } as never,
    };
    const mapped = resolveControlUiError(forbidden);
    assert.equal(mapped.kind, 'forbidden');
    assert.equal(mapped.message, 'No tienes permisos para ver esta operación.');
    assert.equal(mapped.message.includes('{'), false);
    assert.equal(mapped.message.includes('trace_id'), false);

    const network = resolveControlUiError(new Error('Network Error'));
    assert.equal(network.message, 'No pudimos actualizar la operación.');
    assert.equal(network.message.includes('Axios'), false);
  });
});

describe('TEST 7 — presentation mode oculta campos internos', () => {
  it('mantiene contenedor/estado y oculta scores e IDs técnicos', () => {
    assert.equal(shouldShowControlField('containerId', true), true);
    assert.equal(shouldShowControlField('currentPhaseLabel', true), true);
    assert.equal(shouldShowControlField('eta', true), true);
    assert.equal(shouldShowControlField('riskReasons', true), true);
    assert.equal(shouldShowControlField('timeline', true), true);

    assert.equal(isPresentationHiddenField('riskScore', true), true);
    assert.equal(isPresentationHiddenField('matchScore', true), true);
    assert.equal(isPresentationHiddenField('declarationId', true), true);
    assert.equal(isPresentationHiddenField('monitoringId', true), true);
    assert.equal(isPresentationHiddenField('messengerId', true), true);
    assert.equal(isPresentationHiddenField('gpsStatus', true), true);
    assert.equal(isPresentationHiddenField('nodeCode', true), true);

    assert.equal(isPresentationHiddenField('riskScore', false), false);
  });
});
