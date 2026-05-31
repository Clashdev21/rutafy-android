/** Roles operativos devueltos por GET /v1/auth/me (mismo contrato que Rutafy Web). */
export type AppRole = 'ADMIN' | 'TRANSPORTISTA' | 'MENSAJERO';

/** Rutas móviles soportadas en Sprint 1. */
export type MobileRole = 'transportista' | 'mensajero';

export type AuthUser = {
  id: string | number;
  user_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  appRole: AppRole;
  actor_id: string | null;
  actor_type: string | null;
};

export type LoginCredentials = {
  phone: string;
  password: string;
};

export type TokenPairResponse = {
  access_token?: string;
  accessToken?: string;
  refresh_token?: string;
  refreshToken?: string;
};

export type RefreshTokenResponse = {
  access_token?: string;
  accessToken?: string;
};
