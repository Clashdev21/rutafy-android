import { type Href, router } from 'expo-router';
import { useCallback } from 'react';

import { useAuth } from '@/auth/useAuth';
import { EditProfileScreen } from '@/components/account/EditProfileScreen';
import type { AuthUser } from '@/types/auth';

/**
 * Edición de perfil — mensajero (PROFILE 1C).
 * Compartido vía EditProfileScreen.
 */
export default function MensajeroEditarPerfilScreen() {
  const { user, refreshCurrentUser } = useAuth();

  const handleSuccess = useCallback(
    async (_updated: AuthUser) => {
      await refreshCurrentUser();
      router.back();
    },
    [refreshCurrentUser],
  );

  return (
    <EditProfileScreen
      user={user}
      onCancel={() => router.back()}
      onSuccess={handleSuccess}
    />
  );
}

/** Href tipado para navegación desde Cuenta. */
export const MENSAJERO_EDIT_PROFILE_HREF = '/mensajero/editar-perfil' as Href;
