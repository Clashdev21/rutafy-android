/**
 * Expo config dinámico — MAP 1A + Staging Identity v1
 *
 * Google Maps (Android) requiere API key en el rebuild nativo.
 * NO hardcodear secretos. Definir en el entorno antes de `expo run:android`:
 *
 *   GOOGLE_MAPS_ANDROID_API_KEY=<tu-clave>
 *
 * Identidad nativa: EXPO_PUBLIC_APP_ENV=staging | production
 * API: EXPO_PUBLIC_API_URL (sin fallback de staging en el cliente).
 */
const fs = require('fs')
const path = require('path')

const appJson = require('./app.json')
const {
  resolveAppIdentity,
  resolveGoogleServicesFile,
  pickExistingPath,
} = require('./src/config/resolveAppIdentity.js')

const identity = resolveAppIdentity({
  appEnvRaw: process.env.EXPO_PUBLIC_APP_ENV,
  apiUrl: process.env.EXPO_PUBLIC_API_URL,
})

const googleMapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim() ?? ''

const productionGoogleServices = './google-services.json'
const stagingGoogleServices = './google-services.staging.json'

function readGoogleServicesJson (rel) {
  const abs = path.resolve(__dirname, rel)
  return JSON.parse(fs.readFileSync(abs, 'utf8'))
}

const googleServices = resolveGoogleServicesFile({
  appEnv: identity.appEnv,
  envPath: process.env.GOOGLE_SERVICES_JSON,
  stagingPath: stagingGoogleServices,
  productionPath: productionGoogleServices,
  existsFn: (p) => fs.existsSync(path.resolve(__dirname, p)),
  readJsonFn: readGoogleServicesJson,
})

const googleServicesFile = googleServices.path

const exists = (rel) => fs.existsSync(path.resolve(__dirname, rel))

const productionIcon = './assets/images/app-icon.png'
const productionAdaptive = './assets/images/adaptive-icon.png'
const productionSplash = './assets/images/splash-icon.png'

const stagingIcon = './assets/images/staging/app-icon.png'
const stagingAdaptive = './assets/images/staging/adaptive-icon.png'
const stagingSplash = './assets/images/staging/splash-icon.png'

const icon =
  identity.appEnv === 'staging'
    ? pickExistingPath(exists, stagingIcon, productionIcon)
    : productionIcon
const adaptiveIcon =
  identity.appEnv === 'staging'
    ? pickExistingPath(exists, stagingAdaptive, productionAdaptive)
    : productionAdaptive
const splashIcon =
  identity.appEnv === 'staging'
    ? pickExistingPath(exists, stagingSplash, productionSplash)
    : productionSplash

function mapPlugins (plugins) {
  return (plugins ?? []).map((plugin) => {
    if (Array.isArray(plugin) && plugin[0] === 'expo-splash-screen') {
      const cfg = { ...(plugin[1] || {}) }
      cfg.image = splashIcon
      if (cfg.android && typeof cfg.android === 'object') {
        cfg.android = { ...cfg.android, image: splashIcon }
      }
      return ['expo-splash-screen', cfg]
    }
    if (Array.isArray(plugin) && plugin[0] === 'expo-notifications') {
      const cfg = { ...(plugin[1] || {}) }
      cfg.icon = adaptiveIcon
      return ['expo-notifications', cfg]
    }
    return plugin
  })
}

const plugins = mapPlugins(appJson.expo.plugins ?? [])

if (googleMapsKey) {
  plugins.push([
    'react-native-maps',
    {
      androidGoogleMapsApiKey: googleMapsKey,
    },
  ])
} else {
  plugins.push('react-native-maps')
}

const extra = {
  ...(appJson.expo.extra ?? {}),
  appEnv: identity.appEnv,
  firebaseStagingStatus:
    identity.appEnv === 'staging' ? googleServices.status : undefined,
}

const android = {
  ...appJson.expo.android,
  package: identity.androidPackage,
  adaptiveIcon: {
    ...(appJson.expo.android?.adaptiveIcon ?? {}),
    foregroundImage: adaptiveIcon,
    monochromeImage: adaptiveIcon,
  },
}

if (googleServicesFile) {
  android.googleServicesFile = googleServicesFile
} else {
  delete android.googleServicesFile
}

module.exports = {
  ...appJson.expo,
  name: identity.name,
  icon,
  scheme: identity.scheme,
  ios: {
    ...(appJson.expo.ios ?? {}),
    icon,
  },
  android,
  extra,
  plugins,
}
