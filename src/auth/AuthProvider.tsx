import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { AuthContext, type AuthContextValue } from '@/auth/AuthContext';
import { sessionEvents } from '@/auth/sessionEvents';
import { tokenStorage } from '@/auth/tokenStorage';
import * as authService from '@/services/authService';
import {
  registerDevicePushTokenAsync,
  unregisterDevicePushTokenAsync,
} from '@/services/notificationService';
import type { AuthUser, LoginCredentials, RegisterTransportistaPayload } from '@/types/auth';
import { getApiErrorMessage } from '@/utils/errors';
import {
  isConfirmedAuthInvalidError,
  isTransientNetworkError,
  NETWORK_UNAVAILABLE_MESSAGE,
} from '@/utils/networkErrors';
import { isAdminRole, isMobileSupportedRole } from '@/utils/roles';

type AuthProviderProps = {
  children: ReactNode;
};

function logLogoutReason(reason: string, detail?: unknown): void {
  if (__DEV__) {
    console.log('[auth-logout-reason]', { reason, detail });
  }
}

function schedulePushRegistration(): void {
  void registerDevicePushTokenAsync();
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [hasPersistedSession, setHasPersistedSession] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearLocalSession = useCallback(async (reason: string, detail?: unknown) => {
    logLogoutReason(reason, detail);
    await tokenStorage.clearAll();
    setUser(null);
    setHasPersistedSession(false);
    setError(null);
  }, []);

  const refreshSession = useCallback(async () => {
    const access = await tokenStorage.getAccessToken();
    if (!access) {
      setUser(null);
      setHasPersistedSession(false);
      setError(null);
      setIsLoading(false);
      return;
    }

    setHasPersistedSession(true);
    setIsLoading(true);
    try {
      const me = await authService.fetchCurrentUser();
      if (!me.actor_id?.trim() || !isMobileSupportedRole(me.appRole)) {
        throw new Error('Sesión sin actor operativo válido');
      }
      if (isAdminRole(me.appRole)) {
        await authService.logout();
        setUser(null);
        setHasPersistedSession(false);
        setError('Las cuentas de administrador solo están disponibles en la web.');
        return;
      }
      if (!isMobileSupportedRole(me.appRole)) {
        await authService.logout();
        setUser(null);
        setHasPersistedSession(false);
        setError('Este tipo de cuenta no está disponible en la app móvil.');
        return;
      }
      setUser(me);
      setError(null);
      schedulePushRegistration();
    } catch (e) {
      if (isTransientNetworkError(e)) {
        if (__DEV__) {
          console.log('[auth-network-error]', { context: 'refresh_session' });
        }
        setError(NETWORK_UNAVAILABLE_MESSAGE);
        return;
      }

      if (isConfirmedAuthInvalidError(e)) {
        await clearLocalSession('refresh_session_auth_invalid');
        setError(getApiErrorMessage(e, 'Sesión expirada. Inicia sesión de nuevo.'));
        return;
      }

      await clearLocalSession('refresh_session_validation_failed', {
        message: getApiErrorMessage(e, 'No se pudo validar la sesión'),
      });
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
        logLogoutReason('session_expired_event');
        await tokenStorage.clearAll();
        setUser(null);
        setHasPersistedSession(false);
        setError(null);
        router.replace('/login');
      })();
    });
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && error === NETWORK_UNAVAILABLE_MESSAGE) {
        void refreshSession();
      }
    });
    return () => sub.remove();
  }, [error, refreshSession]);

  const finalizeAuthenticatedUser = useCallback(async (me: AuthUser): Promise<AuthUser> => {
    if (isAdminRole(me.appRole)) {
      await authService.logout();
      setUser(null);
      setHasPersistedSession(false);
      setError('Las cuentas de administrador solo están disponibles en la web.');
      throw new Error('ADMIN_NOT_SUPPORTED');
    }
    if (!isMobileSupportedRole(me.appRole)) {
      await authService.logout();
      setUser(null);
      setHasPersistedSession(false);
      setError('Este tipo de cuenta no está disponible en la app móvil.');
      throw new Error('ROLE_NOT_SUPPORTED');
    }
    if (!me.actor_id?.trim()) {
      await authService.logout();
      setUser(null);
      setHasPersistedSession(false);
      setError('Sesión sin actor operativo válido.');
      throw new Error('ACTOR_NOT_SUPPORTED');
    }
    setUser(me);
    setHasPersistedSession(true);
    schedulePushRegistration();
    return me;
  }, []);

  const login = useCallback(async (credentials: LoginCredentials): Promise<AuthUser> => {
    setIsLoading(true);
    setError(null);
    try {
      const me = await authService.login(credentials);
      return await finalizeAuthenticatedUser(me);
    } catch (e) {
      if (
        e instanceof Error &&
        (e.message === 'ADMIN_NOT_SUPPORTED' ||
          e.message === 'ROLE_NOT_SUPPORTED' ||
          e.message === 'ACTOR_NOT_SUPPORTED')
      ) {
        throw e;
      }
      const message = isTransientNetworkError(e)
        ? NETWORK_UNAVAILABLE_MESSAGE
        : getApiErrorMessage(e, 'Error al iniciar sesión');
      setError(message);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [finalizeAuthenticatedUser]);

  const registerTransportista = useCallback(
    async (payload: RegisterTransportistaPayload): Promise<AuthUser> => {
      setIsLoading(true);
      setError(null);
      try {
        const me = await authService.registerTransportista(payload);
        return await finalizeAuthenticatedUser(me);
      } catch (e) {
        if (
          e instanceof Error &&
          (e.message === 'ADMIN_NOT_SUPPORTED' ||
            e.message === 'ROLE_NOT_SUPPORTED' ||
            e.message === 'ACTOR_NOT_SUPPORTED')
        ) {
          throw e;
        }
        const message = isTransientNetworkError(e)
          ? NETWORK_UNAVAILABLE_MESSAGE
          : getApiErrorMessage(e, 'Error al crear la cuenta');
        setError(message);
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [finalizeAuthenticatedUser],
  );

  const logout = useCallback(async () => {
    logLogoutReason('user_logout');
    setIsLoading(true);
    try {
      await unregisterDevicePushTokenAsync();
      await authService.logout();
    } catch {
      await tokenStorage.clearAll();
    } finally {
      setUser(null);
      setHasPersistedSession(false);
      setError(null);
      setIsLoading(false);
      router.replace('/login');
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user) || hasPersistedSession,
      error,
      login,
      registerTransportista,
      logout,
      refreshSession,
    }),
    [user, isLoading, hasPersistedSession, error, login, registerTransportista, logout, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
