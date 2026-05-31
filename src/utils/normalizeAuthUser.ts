import type { AppRole, AuthUser } from '@/types/auth';

function pickStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function upper(v: string | null): string {
  return (v || '').toUpperCase();
}

/**
 * Convierte la respuesta de GET /v1/auth/me al shape usado en la app móvil.
 * Misma lógica que portex-rutafy/client/src/authUser.ts (sin requester_profile).
 */
export function normalizeAuthUser(raw: unknown): AuthUser | null {
  if (!raw || typeof raw !== 'object') return null;

  let o = raw as Record<string, unknown>;
  if (
    o.data &&
    typeof o.data === 'object' &&
    !pickStr(o.sub) &&
    o.id === undefined &&
    !(o.user && typeof o.user === 'object')
  ) {
    o = o.data as Record<string, unknown>;
  }

  const u =
    o.user && typeof o.user === 'object' ? (o.user as Record<string, unknown>) : o;

  const subLike =
    pickStr(u.user_id) ?? pickStr(u.sub) ?? (u.id != null ? pickStr(u.id) : null);

  if (!subLike) return null;

  const user_id = subLike;
  const idVal = u.id !== undefined && u.id !== null ? u.id : user_id;

  const name = pickStr(u.name);
  const email = pickStr(u.email);
  const phone = pickStr(u.phone);
  const actor_id = pickStr(u.actor_id);
  const actor_type = pickStr(u.actor_type);

  const roleRaw = upper(pickStr(u.role));
  const appRoleRaw = upper(pickStr(u.appRole));
  const actorTypeU = upper(actor_type);

  let appRole: AppRole = 'TRANSPORTISTA';
  if (appRoleRaw === 'ADMIN' || roleRaw === 'ADMIN' || actorTypeU === 'ADMIN') {
    appRole = 'ADMIN';
  } else if (
    appRoleRaw === 'MENSAJERO' ||
    roleRaw === 'MENSAJERO' ||
    actorTypeU === 'MENSAJERO' ||
    actorTypeU === 'MESSENGER'
  ) {
    appRole = 'MENSAJERO';
  } else if (
    appRoleRaw === 'TRANSPORTISTA' ||
    roleRaw === 'TRANSPORTISTA' ||
    actorTypeU === 'TRANSPORTISTA' ||
    actorTypeU === 'TRANSPORTER'
  ) {
    appRole = 'TRANSPORTISTA';
  }

  const roleForLayout = appRole === 'ADMIN' || roleRaw === 'ADMIN' ? 'admin' : 'user';

  return {
    id: idVal as string | number,
    user_id,
    name,
    email,
    phone,
    role: roleForLayout,
    appRole,
    actor_id,
    actor_type,
  };
}
