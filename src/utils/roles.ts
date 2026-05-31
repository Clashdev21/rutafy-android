import type { Href } from 'expo-router';

import type { AppRole, AuthUser, MobileRole } from '@/types/auth';

export function appRoleToMobileRole(appRole: AppRole): MobileRole | null {
  if (appRole === 'TRANSPORTISTA') return 'transportista';
  if (appRole === 'MENSAJERO') return 'mensajero';
  return null;
}

export function getHomeHrefForUser(user: AuthUser | null): Href {
  if (!user) return '/login' as Href;
  const mobile = appRoleToMobileRole(user.appRole);
  if (mobile === 'transportista') return '/transportista' as Href;
  if (mobile === 'mensajero') return '/mensajero' as Href;
  return '/login' as Href;
}

export function isMobileSupportedRole(appRole: AppRole): boolean {
  return appRole === 'TRANSPORTISTA' || appRole === 'MENSAJERO';
}

export function isAdminRole(appRole: AppRole): boolean {
  return appRole === 'ADMIN';
}
