import { router, usePathname, type Href } from 'expo-router';
import { useEffect } from 'react';

import { useAuth } from '@/auth/useAuth';
import { isPublicOnboardingRoute } from '@/utils/authPublicRoutes';
import { appRoleToMobileRole, getHomeHrefForUser } from '@/utils/roles';

/**
 * Redirige según sesión y rol cuando el usuario navega fuera de la ruta permitida.
 */
export function AuthNavigationGuard() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;

    const isIndex = pathname === '/' || pathname === '';
    const onPublicOnboarding = isPublicOnboardingRoute(pathname);
    const onTransportista = pathname.startsWith('/transportista');
    const onMensajero = pathname.startsWith('/mensajero');
    const onCapturaLogistica = pathname.startsWith('/captura-logistica');

    if (!isAuthenticated) {
      if (onTransportista || onMensajero || onCapturaLogistica) {
        router.replace('/welcome' as Href);
      }
      return;
    }

    const home = getHomeHrefForUser(user);
    const mobileRole = user ? appRoleToMobileRole(user.appRole) : null;

    if (isAuthenticated && (isIndex || onPublicOnboarding)) {
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
