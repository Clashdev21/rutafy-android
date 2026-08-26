/**
 * Helpers puros PROFILE 1C — validación local y PATCH parcial.
 * Backend sigue siendo autoridad de normalización.
 */

import type { AuthUser, UpdateProfileInput } from '@/types/auth';

export type ProfileFormValues = {
  name: string;
  phone: string;
  email: string;
};

export type ProfileFormLocalError =
  | 'empty_name'
  | 'empty_phone'
  | 'invalid_email'
  | 'no_changes';

const BASIC_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function profileFormFromUser(user: AuthUser | null): ProfileFormValues {
  return {
    name: user?.name?.trim() ?? '',
    phone: user?.phone?.trim() ?? '',
    email: user?.email?.trim() ?? '',
  };
}

export function normalizeEmailForPayload(emailRaw: string): string | null {
  const trimmed = emailRaw.trim();
  return trimmed.length ? trimmed : null;
}

/**
 * Construye payload parcial solo con campos modificados.
 * Email vacío → null (borrar correo).
 * Retorna null si no hay cambios.
 */
export function buildProfileUpdatePayload(
  initial: ProfileFormValues,
  current: ProfileFormValues,
): UpdateProfileInput | null {
  const payload: UpdateProfileInput = {};

  const name = current.name.trim();
  const phone = current.phone.trim();
  const email = normalizeEmailForPayload(current.email);

  const initialName = initial.name.trim();
  const initialPhone = initial.phone.trim();
  const initialEmail = normalizeEmailForPayload(initial.email);

  if (name !== initialName) payload.name = name;
  if (phone !== initialPhone) payload.phone = phone;
  if (email !== initialEmail) payload.email = email;

  if (Object.keys(payload).length === 0) return null;
  return payload;
}

export function validateProfileFormLocal(
  values: ProfileFormValues,
  initial: ProfileFormValues,
): ProfileFormLocalError | null {
  if (!values.name.trim()) return 'empty_name';
  if (!values.phone.trim()) return 'empty_phone';

  const emailTrimmed = values.email.trim();
  if (emailTrimmed && !BASIC_EMAIL_RE.test(emailTrimmed)) {
    return 'invalid_email';
  }

  if (buildProfileUpdatePayload(initial, values) == null) {
    return 'no_changes';
  }

  return null;
}

export function localProfileErrorMessage(code: ProfileFormLocalError): string {
  switch (code) {
    case 'empty_name':
      return 'Ingresa un nombre válido.';
    case 'empty_phone':
      return 'Ingresa un número de teléfono válido.';
    case 'invalid_email':
      return 'Ingresa un correo válido.';
    case 'no_changes':
      return 'No hay cambios para guardar.';
    default:
      return 'Revisa los datos del formulario.';
  }
}

/** Extrae código de error backend (error | code). */
export function extractProfileApiErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const ax = error as {
    response?: { data?: { error?: unknown; code?: unknown; message?: unknown } };
  };
  const data = ax.response?.data;
  if (!data || typeof data !== 'object') return null;
  for (const key of ['error', 'code'] as const) {
    const v = data[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  if (typeof data.message === 'string' && data.message.trim()) {
    return data.message.trim();
  }
  return null;
}

export function mapProfileApiErrorMessage(error: unknown): string {
  const code = extractProfileApiErrorCode(error)?.toLowerCase() ?? '';

  if (code.includes('invalid_name') || code === 'invalid_name') {
    return 'Ingresa un nombre válido.';
  }
  if (code.includes('invalid_phone') || code === 'invalid_phone') {
    return 'Ingresa un número de teléfono válido.';
  }
  if (code.includes('invalid_email') || code === 'invalid_email') {
    return 'Ingresa un correo válido.';
  }
  if (code.includes('phone_already_in_use')) {
    return 'Ese número ya está asociado a otra cuenta.';
  }
  if (code.includes('email_already_in_use')) {
    return 'Ese correo ya está asociado a otra cuenta.';
  }
  if (code.includes('no_fields_to_update')) {
    return 'No hay cambios para guardar.';
  }
  if (code.includes('protected_profile_field')) {
    return 'No pudimos actualizar tu perfil. Intenta de nuevo.';
  }

  return 'No pudimos actualizar tu perfil. Intenta de nuevo.';
}

/** Asegura que el payload nunca envíe role/actor_id. */
export function sanitizeProfilePayload(input: UpdateProfileInput): UpdateProfileInput {
  const out: UpdateProfileInput = {};
  if (typeof input.name === 'string') out.name = input.name;
  if (typeof input.phone === 'string') out.phone = input.phone;
  if (input.email === null || typeof input.email === 'string') out.email = input.email;
  return out;
}
