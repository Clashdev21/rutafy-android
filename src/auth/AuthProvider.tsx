import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { AuthContext, type AuthContextValue } from '@/auth/AuthContext';
import { sessionEvents } from '@/auth/sessionEvents';
import { tokenStorage } from '@/auth/tokenStorage';
import * as authService from '@/services/authService';
import type { AuthUser, LoginCredentials } from '@/types/auth';
import { getApiErrorMessage } from '@/utils/errors';
import { isAdminRole, isMobileSupportedRole } from '@/utils/roles';

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearLocalSession = useCallback(async () => {
    await tokenStorage.clearAll();
    setUser(null);
    setError(null);
  }, []);

  const refreshSession = useCallback(async () => {
    const access = await tokenStorage.getAccessToken();
    if (!access) {
      setUser(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const me = await authService.fetchCurrentUser();
      if (isAdminRole(me.appRole)) {
        await authService.logout();
        setUser(null);
        setError('Las cuentas de administrador solo están disponibles en la web.');
        return;
      }
      if (!isMobileSupportedRole(me.appRole)) {
        await authService.logout();
        setUser(null);
        setError('Este tipo de cuenta no está disponible en la app móvil.');
        return;
      }
      setUser(me);
      setError(null);
    } catch (e) {
      await clearLocalSession();
      setError(getApiErrorMessage(e, 'No se pudo validar la sesión'));
    } finally {
      setIsLoading(false);
    }
  }, [clearLocalSession]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    return sessionEvents.onSessionExpired(() => {
      void (async () => {
        await clearLocalSession();
        router.replace('/login');
      })();
    });
  }, [clearLocalSession]);

  const login = useCallback(async (credentials: LoginCredentials): Promise<AuthUser> => {
    setIsLoading(true);
    setError(null);
    try {
      const me = await authService.login(credentials);
      if (isAdminRole(me.appRole)) {
        await authService.logout();
        setUser(null);
        setError('Las cuentas de administrador solo están disponibles en la web.');
        throw new Error('ADMIN_NOT_SUPPORTED');
      }
      if (!isMobileSupportedRole(me.appRole)) {
        await authService.logout();
        setUser(null);
        setError('Este tipo de cuenta no está disponible en la app móvil.');
        throw new Error('ROLE_NOT_SUPPORTED');
      }
      setUser(me);
      return me;
    } catch (e) {
      if (
        e instanceof Error &&
        (e.message === 'ADMIN_NOT_SUPPORTED' || e.message === 'ROLE_NOT_SUPPORTED')
      ) {
        throw e;
      }
      const message = getApiErrorMessage(e, 'Error al iniciar sesión');
      setError(message);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await authService.logout();
    } catch {
      await clearLocalSession();
    } finally {
      setUser(null);
      setError(null);
      setIsLoading(false);
      router.replace('/login');
    }
  }, [clearLocalSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      error,
      login,
      logout,
      refreshSession,
    }),
    [user, isLoading, error, login, logout, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
