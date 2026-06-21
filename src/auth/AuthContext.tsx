import { createContext } from 'react';

import type { AuthUser, LoginCredentials, RegisterTransportistaPayload } from '@/types/auth';

export type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  login: (credentials: LoginCredentials) => Promise<AuthUser>;
  registerTransportista: (payload: RegisterTransportistaPayload) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
