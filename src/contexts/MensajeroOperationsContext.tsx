import { createContext, useContext, type ReactNode } from 'react';

import { useAuth } from '@/auth/useAuth';
import { useMensajeroOperations } from '@/hooks/useMensajeroOperations';

type MensajeroOperationsValue = ReturnType<typeof useMensajeroOperations>;

const MensajeroOperationsContext = createContext<MensajeroOperationsValue | null>(null);

type Props = {
  children: ReactNode;
};

export function MensajeroOperationsProvider({ children }: Props) {
  const { user } = useAuth();
  const actorId = user?.actor_id?.trim() ?? null;
  const appRole = user?.appRole ?? null;
  const hasUser = Boolean(user);

  const value = useMensajeroOperations(actorId, appRole, hasUser);
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
