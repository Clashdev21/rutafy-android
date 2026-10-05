/**
 * Staging Identity v1 — tests puros de config.
 * Ejecutar: npm run test:app-identity
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  PRODUCTION_IDENTITY,
  STAGING_BADGE_LABEL,
  STAGING_IDENTITY,
  parseAppEnv,
  resolveAppIdentity,
  resolveGoogleServicesFile,
  shouldShowEnvironmentBadge,
} from '../src/config/resolveAppIdentity.js'

describe('parseAppEnv', () => {
  it('defaults empty to production', () => {
    assert.strictEqual(parseAppEnv(undefined), 'production')
    assert.strictEqual(parseAppEnv(''), 'production')
    assert.strictEqual(parseAppEnv('production'), 'production')
  })

  it('accepts staging', () => {
    assert.strictEqual(parseAppEnv('staging'), 'staging')
    assert.strictEqual(parseAppEnv(' STAGING '), 'staging')
  })

  it('rejects invalid environment', () => {
    assert.throws(() => parseAppEnv('dev'), { code: 'invalid_app_env' })
    assert.throws(() => parseAppEnv('prod'), { code: 'invalid_app_env' })
  })
})

describe('production identity', () => {
  it('keeps production name, package and scheme', () => {
    const id = resolveAppIdentity({ appEnvRaw: 'production' })
    assert.strictEqual(id.appEnv, 'production')
    assert.strictEqual(id.name, 'Rutafy')
    assert.strictEqual(id.androidPackage, 'com.rutafy.rutafyandroid')
    assert.strictEqual(id.scheme, 'rutafyandroid')
    assert.deepEqual(id, { ...PRODUCTION_IDENTITY })
  })

  it('allows unset API URL (client production fallback remains elsewhere)', () => {
    const id = resolveAppIdentity({ appEnvRaw: undefined, apiUrl: undefined })
    assert.strictEqual(id.appEnv, 'production')
    assert.strictEqual(id.androidPackage, PRODUCTION_IDENTITY.androidPackage)
  })

  it('allows explicit production API host', () => {
    const id = resolveAppIdentity({
      appEnvRaw: 'production',
      apiUrl: 'https://api.rutafy.app',
    })
    assert.strictEqual(id.scheme, 'rutafyandroid')
  })
})

describe('staging identity', () => {
  it('uses staging name, package and scheme', () => {
    const id = resolveAppIdentity({
      appEnvRaw: 'staging',
      apiUrl: 'https://staging-api.rutafy.app',
    })
    assert.strictEqual(id.appEnv, 'staging')
    assert.strictEqual(id.name, 'Rutafy STAGING')
    assert.strictEqual(id.androidPackage, 'com.rutafy.rutafyandroid.staging')
    assert.strictEqual(id.scheme, 'rutafyandroid-staging')
    assert.deepEqual(id, { ...STAGING_IDENTITY })
  })

  it('requires API URL (no production fallback)', () => {
    assert.throws(
      () => resolveAppIdentity({ appEnvRaw: 'staging' }),
      { code: 'staging_api_url_required' },
    )
  })
})

describe('cross-env API guards', () => {
  it('rejects staging with production API', () => {
    assert.throws(
      () =>
        resolveAppIdentity({
          appEnvRaw: 'staging',
          apiUrl: 'https://api.rutafy.app',
        }),
      { code: 'staging_api_cross_env' },
    )
  })

  it('rejects production with staging API', () => {
    assert.throws(
      () =>
        resolveAppIdentity({
          appEnvRaw: 'production',
          apiUrl: 'https://staging-api.rutafy.app',
        }),
      { code: 'production_api_cross_env' },
    )
  })
})

describe('environment badge condition', () => {
  it('shows only for staging', () => {
    assert.strictEqual(shouldShowEnvironmentBadge('staging'), true)
    assert.strictEqual(shouldShowEnvironmentBadge('production'), false)
    assert.strictEqual(STAGING_BADGE_LABEL, 'STAGING • NO PRODUCCIÓN')
  })
})

describe('google-services path', () => {
  const stagingPkgJson = {
    client: [
      {
        client_info: {
          android_client_info: { package_name: 'com.rutafy.rutafyandroid.staging' },
        },
      },
    ],
  }
  const productionPkgJson = {
    client: [
      {
        client_info: {
          android_client_info: { package_name: 'com.rutafy.rutafyandroid' },
        },
      },
    ],
  }

  it('production keeps the production google-services path', () => {
    const resolved = resolveGoogleServicesFile({
      appEnv: 'production',
      envPath: '',
      stagingPath: './google-services.staging.json',
      productionPath: './google-services.json',
      existsFn: () => true,
      readJsonFn: () => productionPkgJson,
    })
    assert.strictEqual(resolved.path, './google-services.json')
    assert.strictEqual(resolved.status, 'production')
  })

  it('prefers GOOGLE_SERVICES_JSON when it matches staging package', () => {
    const resolved = resolveGoogleServicesFile({
      appEnv: 'staging',
      envPath: './custom-staging.json',
      stagingPath: './google-services.staging.json',
      productionPath: './google-services.json',
      existsFn: () => true,
      readJsonFn: () => stagingPkgJson,
    })
    assert.strictEqual(resolved.path, './custom-staging.json')
    assert.strictEqual(resolved.status, 'staging_configured')
  })

  it('uses google-services.staging.json when present and package matches', () => {
    const resolved = resolveGoogleServicesFile({
      appEnv: 'staging',
      envPath: '',
      stagingPath: './google-services.staging.json',
      productionPath: './google-services.json',
      existsFn: (p) => p === './google-services.staging.json',
      readJsonFn: () => stagingPkgJson,
    })
    assert.strictEqual(resolved.path, './google-services.staging.json')
    assert.strictEqual(resolved.status, 'staging_configured')
  })

  it('does not silently fall back to production json for staging', () => {
    const resolved = resolveGoogleServicesFile({
      appEnv: 'staging',
      envPath: '',
      stagingPath: './google-services.staging.json',
      productionPath: './google-services.json',
      existsFn: (p) => p === './google-services.json',
      readJsonFn: () => productionPkgJson,
    })
    assert.strictEqual(resolved.path, null)
    assert.strictEqual(resolved.status, 'staging_not_configured')
  })

  it('rejects an explicit path whose package is production', () => {
    const resolved = resolveGoogleServicesFile({
      appEnv: 'staging',
      envPath: './google-services.json',
      stagingPath: './google-services.staging.json',
      productionPath: './google-services.json',
      existsFn: () => true,
      readJsonFn: () => productionPkgJson,
    })
    assert.strictEqual(resolved.path, null)
    assert.strictEqual(resolved.status, 'staging_not_configured')
  })

  it('does not treat unreadable staging json as configured', () => {
    const resolved = resolveGoogleServicesFile({
      appEnv: 'staging',
      envPath: './google-services.staging.json',
      stagingPath: './google-services.staging.json',
      productionPath: './google-services.json',
      existsFn: () => true,
      readJsonFn: () => {
        throw new Error('unreadable')
      },
    })
    assert.strictEqual(resolved.path, null)
    assert.strictEqual(resolved.status, 'staging_not_configured')
  })
})
