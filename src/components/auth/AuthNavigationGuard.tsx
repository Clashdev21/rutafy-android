import { router, usePathname } from 'expo-router';
import { useEffect } from 'react';

import { useAuth } from '@/auth/useAuth';
import { appRoleToMobileRole, getHomeHrefForUser } from '@/utils/roles';

/**
 * Redirige según sesión y rol cuando el usuario navega fuera de la ruta permitida.
 */
export function AuthNavigationGuard() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;

    const isLogin = pathname === '/login';
    const isIndex = pathname === '/' || pathname === '';
    const onTransportista = pathname.startsWith('/transportista');
    const onMensajero = pathname.startsWith('/mensajero');

    if (!isAuthenticated) {
      if (onTransportista || onMensajero) {
        router.replace('/login');
      }
      return;
    }

    const home = getHomeHrefForUser(user);
    const mobileRole = user ? appRoleToMobileRole(user.appRole) : null;

    if (isAuthenticated && (isLogin || isIndex)) {
      router.replace(home);
      return;
    }

    if (onTransportista && mobileRole !== 'transportista') {
      router.replace(home);
    }
    if (onMensajero && mobileRole !== 'mensajero') {
      router.replace(home);
    }
  }, [isLoading, isAuthenticated, user, pathname]);

  return null;
}
