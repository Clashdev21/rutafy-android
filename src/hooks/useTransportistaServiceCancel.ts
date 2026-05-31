import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { useAuth } from '@/auth/useAuth';
import { useTransportistaServicesContext } from '@/contexts/TransportistaServicesContext';
import * as transportistaService from '@/services/transportistaService';
import type { Service } from '@/types/service';
import { shouldShowTransportistaCancelButton } from '@/utils/transportistaCancelAction';
import { getApiErrorMessage } from '@/utils/errors';

export function useTransportistaServiceCancel() {
  const { user } = useAuth();
  const { refresh } = useTransportistaServicesContext();
  const [cancellingServiceId, setCancellingServiceId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const requesterCompanyId = user?.actor_id?.trim() ?? null;

  const performCancel = useCallback(
    async (service: Service) => {
      if (!requesterCompanyId) {
        setCancelError('No hay empresa asociada a la sesión (actor_id).');
        return;
      }

      setCancellingServiceId(service.service_id);
      setCancelError(null);

      try {
        await transportistaService.cancelService(service.service_id, requesterCompanyId);
        await refresh(false);
      } catch (e) {
        setCancelError(getApiErrorMessage(e, 'No se pudo cancelar el servicio'));
      } finally {
        setCancellingServiceId(null);
      }
    },
    [requesterCompanyId, refresh],
  );

  const confirmAndCancel = useCallback(
    (service: Service) => {
      if (!shouldShowTransportistaCancelButton(service)) return;
      if (cancellingServiceId === service.service_id) return;

      Alert.alert(
        'Cancelar servicio',
        '¿Cancelar este servicio? Aún no ha sido tomado por un mensajero. Esta acción no se puede deshacer.',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Aceptar',
            style: 'destructive',
            onPress: () => void performCancel(service),
          },
        ],
      );
    },
    [cancellingServiceId, performCancel],
  );

  const isCancelling = useCallback(
    (serviceId: string) => cancellingServiceId === serviceId,
    [cancellingServiceId],
  );

  return {
    confirmAndCancel,
    isCancelling,
    cancelError,
    clearCancelError: () => setCancelError(null),
    canOperate: Boolean(requesterCompanyId),
  };
}
