import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  canHydrateMyServices,
  deriveMensajeroOperationalUiState,
  MENSAJERO_OFFER_REJECT_SUPPORTED,
} from '../src/utils/mensajeroOperationalState.ts';
import { recoverAfterCloseSuccess, CLOSE_AVAILABILITY_WARNING } from '../src/utils/mensajeroCloseRecovery.ts';
import { buildGeoNavigationUri, hasValidGeoCoordinate } from '../src/utils/geoNavigation.ts';

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
