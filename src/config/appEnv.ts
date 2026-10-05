/**
 * Entorno de app en runtime (Metro inlinea EXPO_PUBLIC_*).
 * La identidad nativa (package/scheme) vive en app.config.js.
 */

export type AppEnv = 'production' | 'staging'

export const STAGING_BADGE_LABEL = 'STAGING • NO PRODUCCIÓN'

export function parseRuntimeAppEnv (
  raw: string | undefined | null,
): AppEnv {
  return String(raw ?? '').trim().toLowerCase() === 'staging'
    ? 'staging'
    : 'production'
}

export const APP_ENV: AppEnv = parseRuntimeAppEnv(
  process.env.EXPO_PUBLIC_APP_ENV,
)

export const isStaging = APP_ENV === 'staging'

export function shouldShowEnvironmentBadge (appEnv: AppEnv): boolean {
  return appEnv === 'staging'
}
