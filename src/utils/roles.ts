import type { Href } from 'expo-router';

import type { AppRole, AuthUser, MobileRole } from '@/types/auth';

export const CONTROL_HOME_HREF = '/control' as Href;
export const TRANSPORTISTA_HOME_HREF = '/transportista' as Href;
export const MENSAJERO_HOME_HREF = '/mensajero' as Href;

export function appRoleToMobileRole(appRole: AppRole): MobileRole | null {
  if (appRole === 'TRANSPORTISTA') return 'transportista';
  if (appRole === 'MENSAJERO') return 'mensajero';
  if (appRole === 'ADMIN') return 'admin';
  return null;
}

export function getHomeHrefForUser(user: AuthUser | null): Href {
  if (!user) return '/login' as Href;
  const mobile = appRoleToMobileRole(user.appRole);
  if (mobile === 'transportista') return TRANSPORTISTA_HOME_HREF;
  if (mobile === 'mensajero') return MENSAJERO_HOME_HREF;
  if (mobile === 'admin') return CONTROL_HOME_HREF;
  return '/login' as Href;
}

export function isMobileSupportedRole(appRole: AppRole): boolean {
  return appRole === 'TRANSPORTISTA' || appRole === 'MENSAJERO' || appRole === 'ADMIN';
}

export function isAdminRole(appRole: AppRole): boolean {
  return appRole === 'ADMIN';
}

/** ADMIN entra a Control Mobile sin actor_id. Mensajero/transportista sí lo exigen. */
export function isRestorableMobileUser(user: AuthUser): boolean {
  if (isAdminRole(user.appRole)) return true;
  return Boolean(user.actor_id?.trim()) && (user.appRole === 'TRANSPORTISTA' || user.appRole === 'MENSAJERO');
}
