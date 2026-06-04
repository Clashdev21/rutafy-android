import type { AppRole, AuthUser } from '@/types/auth';

function pickStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function upper(v: string | null): string {
  return (v || '').toUpperCase();
}

function pickSessionActor(
  session: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!session?.actor || typeof session.actor !== 'object') return null;
  return session.actor as Record<string, unknown>;
}

/**
 * Convierte la respuesta de GET /v1/auth/me al shape usado en la app móvil.
 * Soporta { user, session } con role/actor en user y session.actor.
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

  const session =
    o.session && typeof o.session === 'object'
      ? (o.session as Record<string, unknown>)
      : null;
  const sessionActor = pickSessionActor(session);

  const u =
    o.user && typeof o.user === 'object' ? (o.user as Record<string, unknown>) : o;

  const actor_id =
    pickStr(u.actor_id) ?? pickStr(sessionActor?.actor_id) ?? null;
  const actor_type =
    pickStr(u.actor_type) ?? pickStr(sessionActor?.actor_type) ?? null;

  const subLike =
    pickStr(u.user_id) ??
    pickStr(u.sub) ??
    (u.id != null ? pickStr(u.id) : null) ??
    actor_id;

  if (!subLike) return null;

  const user_id = subLike;
  const idVal = u.id !== undefined && u.id !== null ? u.id : user_id;

  const name = pickStr(u.name);
  const email = pickStr(u.email);
  const phone = pickStr(u.phone);

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
