'use strict'

/**
 * Identidad nativa y guards de entorno — puro, sin I/O ni Expo.
 * app.config.js y tests de configuración reutilizan este módulo.
 */

const PRODUCTION_API_HOST = 'api.rutafy.app'
const STAGING_API_HOST = 'staging-api.rutafy.app'

const PRODUCTION_IDENTITY = Object.freeze({
  appEnv: 'production',
  name: 'Rutafy',
  androidPackage: 'com.rutafy.rutafyandroid',
  scheme: 'rutafyandroid',
})

const STAGING_IDENTITY = Object.freeze({
  appEnv: 'staging',
  name: 'Rutafy STAGING',
  androidPackage: 'com.rutafy.rutafyandroid.staging',
  scheme: 'rutafyandroid-staging',
})

const STAGING_BADGE_LABEL = 'STAGING • NO PRODUCCIÓN'

function configError (code, message) {
  const err = new Error(message)
  err.code = code
  return err
}

function parseAppEnv (raw) {
  const v = raw == null ? '' : String(raw).trim().toLowerCase()
  if (v === '' || v === 'production') return 'production'
  if (v === 'staging') return 'staging'
  throw configError(
    'invalid_app_env',
    'EXPO_PUBLIC_APP_ENV must be "staging" or "production"'
  )
}

function hostFromApiUrl (apiUrl) {
  const raw = apiUrl == null ? '' : String(apiUrl).trim()
  if (!raw) return null
  try {
    return new URL(raw).hostname.toLowerCase()
  } catch (_) {
    throw configError(
      'invalid_api_url',
      'EXPO_PUBLIC_API_URL must be a valid absolute URL'
    )
  }
}

function assertApiMatchesEnv (appEnv, apiUrl) {
  const raw = apiUrl == null ? '' : String(apiUrl).trim()
  const host = hostFromApiUrl(raw)

  if (appEnv === 'staging') {
    if (!raw) {
      throw configError(
        'staging_api_url_required',
        'EXPO_PUBLIC_API_URL is required when EXPO_PUBLIC_APP_ENV=staging (production fallback must not apply)'
      )
    }
    if (host === PRODUCTION_API_HOST) {
      throw configError(
        'staging_api_cross_env',
        'EXPO_PUBLIC_APP_ENV=staging cannot use the production API host'
      )
    }
    return
  }

  if (host === STAGING_API_HOST) {
    throw configError(
      'production_api_cross_env',
      'EXPO_PUBLIC_APP_ENV=production cannot use the staging API host'
    )
  }
}

function resolveAppIdentity (input = {}) {
  const appEnv = parseAppEnv(input.appEnvRaw)
  assertApiMatchesEnv(appEnv, input.apiUrl)
  const identity = appEnv === 'staging' ? STAGING_IDENTITY : PRODUCTION_IDENTITY
  return {
    appEnv: identity.appEnv,
    name: identity.name,
    androidPackage: identity.androidPackage,
    scheme: identity.scheme,
  }
}

function shouldShowEnvironmentBadge (appEnv) {
  return appEnv === 'staging'
}

function pickExistingPath (existsFn, preferredPath, fallbackPath) {
  if (preferredPath && existsFn(preferredPath)) return preferredPath
  return fallbackPath
}

function androidPackagesFromGoogleServices (json) {
  if (!json || !Array.isArray(json.client)) return []
  return json.client
    .map((client) => client && client.client_info && client.client_info.android_client_info
      ? client.client_info.android_client_info.package_name
      : null)
    .filter((name) => typeof name === 'string' && name.trim() !== '')
}

function googleServicesHasAndroidPackage (json, expectedPackage) {
  return androidPackagesFromGoogleServices(json).includes(expectedPackage)
}

function resolveGoogleServicesFile (input = {}) {
  const existsFn = typeof input.existsFn === 'function' ? input.existsFn : () => false
  const readJsonFn = typeof input.readJsonFn === 'function' ? input.readJsonFn : null
  const envPath = input.envPath == null ? '' : String(input.envPath).trim()
  const productionPath = input.productionPath

  if (input.appEnv !== 'staging') {
    return {
      path: productionPath,
      status: 'production',
    }
  }

  const candidates = []
  if (envPath) candidates.push(envPath)
  if (input.stagingPath) candidates.push(input.stagingPath)

  const expectedPackage = STAGING_IDENTITY.androidPackage

  for (const candidate of candidates) {
    if (!existsFn(candidate)) continue
    if (!readJsonFn) continue
    let json
    try {
      json = readJsonFn(candidate)
    } catch (_) {
      continue
    }
    if (!googleServicesHasAndroidPackage(json, expectedPackage)) continue
    return {
      path: candidate,
      status: 'staging_configured',
    }
  }

  return {
    path: null,
    status: 'staging_not_configured',
  }
}

module.exports = {
  PRODUCTION_API_HOST,
  STAGING_API_HOST,
  PRODUCTION_IDENTITY,
  STAGING_IDENTITY,
  STAGING_BADGE_LABEL,
  parseAppEnv,
  hostFromApiUrl,
  assertApiMatchesEnv,
  resolveAppIdentity,
  shouldShowEnvironmentBadge,
  pickExistingPath,
  androidPackagesFromGoogleServices,
  googleServicesHasAndroidPackage,
  resolveGoogleServicesFile,
}
