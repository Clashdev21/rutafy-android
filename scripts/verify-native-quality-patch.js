'use strict'

/**
 * TOv2-B — el parche de expo-location tiene que seguir aplicado.
 * Falla el postinstall si la versión, el fuente o buildFromSource no coinciden.
 */

const fs = require('fs')
const path = require('path')

const SUPPORTED_EXPO_LOCATION_VERSION = '56.0.18'
const REVIEW_MESSAGE =
  'TOv2-B native observability patch must be reviewed for the new expo-location version.'

const REQUIRED_MARKERS = [
  'TOv2-B: native quality from the same android.location.Location',
  'location.hasAccuracy()',
  'location.hasSpeed()',
  'location.hasBearing()',
  'location.hasSpeedAccuracy()',
  'location.hasBearingAccuracy()',
  'location.elapsedRealtimeNanos.toString()',
  'putString("elapsedRealtimeNanos"',
  'putBoolean("hasSpeed"',
  'putBoolean("hasAccuracy"',
  'putBoolean("hasBearing"',
]

const FORBIDDEN_MARKERS = [
  'putDouble("elapsedRealtimeNanos"',
  'putLong("elapsedRealtimeNanos"',
]

function verifyNativeQualityPatch(input) {
  const errors = []
  if (input.expoLocationVersion !== SUPPORTED_EXPO_LOCATION_VERSION) {
    errors.push(
      `expo-location version is ${String(input.expoLocationVersion)}, expected ${SUPPORTED_EXPO_LOCATION_VERSION}. ${REVIEW_MESSAGE}`
    )
  }

  const source = String(input.locationResultsSource ?? '')
  for (const marker of REQUIRED_MARKERS) {
    if (!source.includes(marker)) {
      errors.push(`LocationResults.kt is missing native patch marker: ${marker}. ${REVIEW_MESSAGE}`)
    }
  }
  for (const marker of FORBIDDEN_MARKERS) {
    if (source.includes(marker)) {
      errors.push(`LocationResults.kt serializes elapsedRealtimeNanos unsafely: ${marker}. ${REVIEW_MESSAGE}`)
    }
  }

  const buildFromSource = input.buildFromSource
  const includesExpoLocation =
    Array.isArray(buildFromSource) && buildFromSource.includes('expo-location')
  if (!includesExpoLocation) {
    errors.push(
      `package.json expo.autolinking.android.buildFromSource must include expo-location. ${REVIEW_MESSAGE}`
    )
  }

  return { ok: errors.length === 0, errors }
}

function readInstalledContract(repoRoot) {
  const locationPackagePath = path.join(repoRoot, 'node_modules', 'expo-location', 'package.json')
  const locationResultsPath = path.join(
    repoRoot,
    'node_modules',
    'expo-location',
    'android',
    'src',
    'main',
    'java',
    'expo',
    'modules',
    'location',
    'records',
    'LocationResults.kt'
  )
  const packageJsonPath = path.join(repoRoot, 'package.json')
  const locationPackage = JSON.parse(fs.readFileSync(locationPackagePath, 'utf8'))
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  return {
    expoLocationVersion: locationPackage.version,
    locationResultsSource: fs.readFileSync(locationResultsPath, 'utf8'),
    buildFromSource: packageJson.expo?.autolinking?.android?.buildFromSource,
  }
}

function main() {
  const result = verifyNativeQualityPatch(readInstalledContract(path.join(__dirname, '..')))
  if (!result.ok) {
    for (const error of result.errors) {
      console.error(error)
    }
    process.exit(1)
  }
  console.log('[native-quality-patch] expo-location 56.0.18 source contract ok')
}

if (require.main === module) {
  main()
}

module.exports = {
  SUPPORTED_EXPO_LOCATION_VERSION,
  REQUIRED_MARKERS,
  FORBIDDEN_MARKERS,
  REVIEW_MESSAGE,
  verifyNativeQualityPatch,
}
