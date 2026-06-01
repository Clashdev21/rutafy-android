import { createContext, useContext, type ReactNode } from 'react';

import { useMensajeroOperations } from '@/hooks/useMensajeroOperations';

type MensajeroOperationsValue = ReturnType<typeof useMensajeroOperations>;

const MensajeroOperationsContext = createContext<MensajeroOperationsValue | null>(null);

type Props = {
  actorId: string | null;
  appRole: 'ADMIN' | 'TRANSPORTISTA' | 'MENSAJERO' | null;
  children: ReactNode;
};

export function MensajeroOperationsProvider({ actorId, appRole, children }: Props) {
  const value = useMensajeroOperations(actorId, appRole);
  return (
    <MensajeroOperationsContext.Provider value={value}>
      {children}
    </MensajeroOperationsContext.Provider>
  );
}

export function useMensajeroOperationsContext(): MensajeroOperationsValue {
  const ctx = useContext(MensajeroOperationsContext);
  if (!ctx) {
    throw new Error('useMensajeroOperationsContext debe usarse dentro de MensajeroOperationsProvider');
  }
  return ctx;
}
