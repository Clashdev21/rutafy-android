import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { formatServiceTypeLabel } from '../src/components/mensajero/serviceDisplay.ts';
import {
  canHydrateMyServices,
  deriveMensajeroOperationalUiState,
  MENSAJERO_OFFER_REJECT_SUPPORTED,
} from '../src/utils/mensajeroOperationalState.ts';
import { recoverAfterCloseSuccess, CLOSE_AVAILABILITY_WARNING } from '../src/utils/mensajeroCloseRecovery.ts';
import { buildGeoNavigationUri, hasValidGeoCoordinate } from '../src/utils/geoNavigation.ts';
import { pickMensajeroActiveService } from '../src/utils/serviceStatus.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('TEST 1 — CLAIMED + isOnline false → ASSIGNED', () => {
  it('deriva ASSIGNED desde backend CLAIMED aunque el toggle local esté offline', () => {
    const ui = deriveMensajeroOperationalUiState({
      activeServiceStatus: 'CLAIMED',
      isOnline: false,
      hasFirstOffer: true,
      pushOfferActive: false,
    });
    assert.equal(ui, 'ASSIGNED');
  });
});

describe('TEST 2 — STARTED + isOnline false → IN_SERVICE', () => {
  it('deriva IN_SERVICE desde backend STARTED aunque el toggle local esté offline', () => {
    const ui = deriveMensajeroOperationalUiState({
      activeServiceStatus: 'STARTED',
      isOnline: false,
      hasFirstOffer: false,
      pushOfferActive: false,
    });
    assert.equal(ui, 'IN_SERVICE');
  });
});

describe('TEST 3 — close 200 + availability error sigue refrescando myServices', () => {
  it('ejecuta refreshMyServices y no deja autoridad visual en el PATCH', async () => {
    let refreshCount = 0;
    const result = await recoverAfterCloseSuccess({
      patchAvailabilityAvailable: async () => {
        throw new Error('availability_patch_failed');
      },
      refreshMyServices: async () => {
        refreshCount += 1;
      },
      restoreLocalOnline: () => {
        throw new Error('must_not_restore_online_on_patch_failure');
      },
    });

    assert.equal(result.didRefreshMyServices, true);
    assert.equal(refreshCount, 1);
    assert.equal(result.availabilityOk, false);
    assert.equal(result.availabilityWarning, CLOSE_AVAILABILITY_WARNING);
    assert.equal(result.availabilityWarning.includes('ya está cerrado'), true);

    const uiAfterClose = deriveMensajeroOperationalUiState({
      activeServiceStatus: null,
      isOnline: false,
      hasFirstOffer: false,
    });
    assert.notEqual(uiAfterClose, 'IN_SERVICE');
    assert.equal(uiAfterClose, 'OFFLINE');
  });
});

describe('TEST 4 — reject: sin endpoint, UI no muestra Rechazar', () => {
  it('marca el contrato de reject como no soportado', () => {
    assert.equal(MENSAJERO_OFFER_REJECT_SUPPORTED, false);
  });

  it('OfferScreen no declara CTA Rechazar ni onOmit', () => {
    const offerUi = readFileSync(
      join(root, 'src/components/mensajero/MensajeroOfferScreen.tsx'),
      'utf8',
    );
    assert.equal(/label=["']Rechazar["']/.test(offerUi), false);
    assert.equal(offerUi.includes('onOmit'), false);
  });
});

describe('TEST 5 — hydrate myServices aunque isOnline=false', () => {
  it('canHydrateMyServices no depende de isOnline', () => {
    assert.equal(
      canHydrateMyServices({ canOperate: true, actorId: '11111111-1111-1111-1111-111111111111' }),
      true,
    );
  });
});

describe('geo CTA', () => {
  it('solo arma URI con coordenadas válidas', () => {
    assert.equal(hasValidGeoCoordinate(4.71, -74.07), true);
    assert.equal(hasValidGeoCoordinate(null, -74.07), false);
    assert.match(buildGeoNavigationUri(4.71, -74.07, 'Origen'), /^geo:4\.71,-74\.07\?q=/);
  });
});

describe('HOTFIX 3C.1 TEST 1 — close 2xx + PATCH AVAILABLE 2xx → isOnline true', () => {
  it('restaura isOnline antes de refresh y deriva AVAILABLE si no hay otro activo', async () => {
    let localOnline = false;
    const order: string[] = [];

    const result = await recoverAfterCloseSuccess({
      patchAvailabilityAvailable: async () => {
        order.push('patch');
      },
      restoreLocalOnline: () => {
        localOnline = true;
        order.push('online');
      },
      refreshMyServices: async () => {
        assert.equal(localOnline, true);
        order.push('refresh');
      },
    });

    assert.deepEqual(order, ['patch', 'online', 'refresh']);
    assert.equal(result.availabilityOk, true);
    assert.equal(result.didRestoreLocalOnline, true);
    assert.equal(result.didRefreshMyServices, true);
    assert.equal(localOnline, true);

    const ui = deriveMensajeroOperationalUiState({
      activeServiceStatus: null,
      isOnline: localOnline,
      hasFirstOffer: false,
    });
    assert.equal(ui, 'AVAILABLE');
    assert.notEqual(ui, 'OFFLINE');
  });
});

describe('HOTFIX 3C.1 TEST 2 — close 2xx + PATCH fail no fuerza isOnline', () => {
  it('deja CLOSED, no restaura online y no vuelve a IN_SERVICE', async () => {
    let localOnline = false;
    let restoreCalls = 0;

    const result = await recoverAfterCloseSuccess({
      patchAvailabilityAvailable: async () => {
        throw new Error('availability_patch_failed');
      },
      restoreLocalOnline: () => {
        restoreCalls += 1;
        localOnline = true;
      },
      refreshMyServices: async () => {},
    });

    assert.equal(result.availabilityOk, false);
    assert.equal(result.didRestoreLocalOnline, false);
    assert.equal(restoreCalls, 0);
    assert.equal(localOnline, false);
    assert.equal(result.availabilityWarning, CLOSE_AVAILABILITY_WARNING);

    const ui = deriveMensajeroOperationalUiState({
      activeServiceStatus: null,
      isOnline: localOnline,
      hasFirstOffer: false,
    });
    assert.notEqual(ui, 'IN_SERVICE');
    assert.notEqual(ui, 'AVAILABLE');
    assert.equal(ui, 'OFFLINE');
  });
});

describe('HOTFIX 3C.1 TEST 3 — close A + otro STARTED → IN_SERVICE', () => {
  it('el STARTED restante manda sobre CLOSED y sobre isOnline', () => {
    const remaining = pickMensajeroActiveService([
      { status: 'CLOSED' },
      { status: 'STARTED' },
    ] as never);

    assert.equal(remaining?.status, 'STARTED');
    assert.equal(
      deriveMensajeroOperationalUiState({
        activeServiceStatus: remaining?.status,
        isOnline: true,
        hasFirstOffer: false,
      }),
      'IN_SERVICE',
    );
  });
});

describe('HOTFIX 3C.1 TEST 4 — close A + otro CLAIMED → ASSIGNED', () => {
  it('el CLAIMED restante manda sobre CLOSED', () => {
    const remaining = pickMensajeroActiveService([
      { status: 'CLOSED' },
      { status: 'CLAIMED' },
    ] as never);

    assert.equal(remaining?.status, 'CLAIMED');
    assert.equal(
      deriveMensajeroOperationalUiState({
        activeServiceStatus: remaining?.status,
        isOnline: true,
        hasFirstOffer: false,
      }),
      'ASSIGNED',
    );
  });
});

describe('HOTFIX 3C.1 TEST 5 — DOCS_PICKUP label', () => {
  it('muestra Recogida de documentos y no el enum', () => {
    assert.equal(formatServiceTypeLabel('DOCS_PICKUP'), 'Recogida de documentos');
    assert.equal(formatServiceTypeLabel('DOCS_PICKUP').includes('DOCS'), false);
  });
});

describe('HOTFIX 3C.1 TEST 6 — service types reales del backend', () => {
  it('mapea cada código contractual a etiqueta operacional', () => {
    assert.equal(formatServiceTypeLabel('DOCS_PICKUP'), 'Recogida de documentos');
    assert.equal(formatServiceTypeLabel('DOCS'), 'Recogida de documentos');
    assert.equal(formatServiceTypeLabel('CUMPLIDOS'), 'Recogida de cumplidos');
    assert.equal(formatServiceTypeLabel('DOCS_DELIVERY'), 'Entrega de documentos');
    assert.equal(formatServiceTypeLabel('MOTO_COURIER'), 'Paquetes');
    assert.equal(formatServiceTypeLabel('MOTO_RIDE'), 'Carrera de moto');
  });
});

describe('HOTFIX 3C.1 TEST 7 — tipo desconocido fallback', () => {
  it('no muestra el enum técnico crudo', () => {
    const label = formatServiceTypeLabel('SOME_FUTURE_ENUM');
    assert.equal(label, 'Servicio de mensajería');
    assert.equal(label.includes('SOME_FUTURE_ENUM'), false);
    assert.equal(label.includes('_'), false);
    assert.equal(formatServiceTypeLabel(''), 'Servicio de mensajería');
    assert.equal(formatServiceTypeLabel(null), 'Servicio de mensajería');
  });
});
