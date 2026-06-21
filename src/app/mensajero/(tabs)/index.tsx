import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { MensajeroInicioView } from '@/components/mensajero/MensajeroInicioView';
import { useMensajeroOperationsContext } from '@/contexts/MensajeroOperationsContext';

export default function MensajeroInicioScreen() {
  const { processPushDispatchIntent } = useMensajeroOperationsContext();

  useFocusEffect(
    useCallback(() => {
      void processPushDispatchIntent();
    }, [processPushDispatchIntent]),
  );

  return <MensajeroInicioView />;
}
