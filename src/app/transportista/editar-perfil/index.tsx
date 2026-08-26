import { type Href, router } from 'expo-router';
import { useCallback } from 'react';

import { useAuth } from '@/auth/useAuth';
import { EditProfileScreen } from '@/components/account/EditProfileScreen';
import type { AuthUser } from '@/types/auth';

/**
 * Edición de perfil — transportista (PROFILE 1C).
 * Misma UI compartida; backend decide sync.
 */
export default function TransportistaEditarPerfilScreen() {
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

export const TRANSPORTISTA_EDIT_PROFILE_HREF = '/transportista/editar-perfil' as Href;
