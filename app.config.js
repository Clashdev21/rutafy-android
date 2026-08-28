/**
 * Expo config dinámico — MAP 1A
 *
 * Google Maps (Android) requiere API key en el rebuild nativo.
 * NO hardcodear secretos. Definir en el entorno antes de `expo run:android`:
 *
 *   GOOGLE_MAPS_ANDROID_API_KEY=<tu-clave>
 *
 * Sin la variable, react-native-maps se registra sin key (mapa puede verse en gris
 * hasta configurar Maps SDK for Android + SHA-1 del keystore de desarrollo).
 */
const appJson = require('./app.json');

const googleMapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim() ?? '';

const googleServicesFile =
  process.env.GOOGLE_SERVICES_JSON?.trim() || './google-services.json';

const plugins = [...(appJson.expo.plugins ?? [])];

if (googleMapsKey) {
  plugins.push([
    'react-native-maps',
    {
      androidGoogleMapsApiKey: googleMapsKey,
    },
  ]);
} else {
  plugins.push('react-native-maps');
}

module.exports = {
  ...appJson.expo,
  android: {
    ...appJson.expo.android,
    googleServicesFile,
  },
  plugins,
};
