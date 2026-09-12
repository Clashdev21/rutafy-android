import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { MensajeroInicioView } from '@/components/mensajero/MensajeroInicioView';
import { useMensajeroOperationsContext } from '@/contexts/MensajeroOperationsContext';

export default function MensajeroInicioScreen() {
  const { processPushDispatchIntent, refreshMyServices, syncBootstrap } =
    useMensajeroOperationsContext();

  useFocusEffect(
    useCallback(() => {
      void refreshMyServices(true);
      void processPushDispatchIntent();
      void syncBootstrap('focus');
    }, [processPushDispatchIntent, refreshMyServices, syncBootstrap]),
  );

  return <MensajeroInicioView />;
}
