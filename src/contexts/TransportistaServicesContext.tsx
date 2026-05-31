import { createContext, useContext, type ReactNode } from 'react';

import { useTransportistaServices } from '@/hooks/useTransportistaServices';
import type { Service } from '@/types/service';

type TransportistaServicesContextValue = ReturnType<typeof useTransportistaServices>;

const TransportistaServicesContext = createContext<TransportistaServicesContextValue | null>(
  null,
);

type ProviderProps = {
  requesterCompanyId: string | null;
  children: ReactNode;
};

export function TransportistaServicesProvider({
  requesterCompanyId,
  children,
}: ProviderProps) {
  const value = useTransportistaServices(requesterCompanyId);
  return (
    <TransportistaServicesContext.Provider value={value}>
      {children}
    </TransportistaServicesContext.Provider>
  );
}

export function useTransportistaServicesContext() {
  const ctx = useContext(TransportistaServicesContext);
  if (!ctx) {
    throw new Error('useTransportistaServicesContext requiere TransportistaServicesProvider');
  }
  return ctx;
}

export type { Service };
