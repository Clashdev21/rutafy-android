import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type ControlPresentationContextValue = {
  presentationMode: boolean;
  setPresentationMode: (value: boolean) => void;
  togglePresentationMode: () => void;
};

const ControlPresentationContext = createContext<ControlPresentationContextValue | null>(null);

export function ControlPresentationProvider({ children }: { children: ReactNode }) {
  const [presentationMode, setPresentationMode] = useState(false);

  const togglePresentationMode = useCallback(() => {
    setPresentationMode((prev) => !prev);
  }, []);

  const value = useMemo<ControlPresentationContextValue>(
    () => ({
      presentationMode,
      setPresentationMode,
      togglePresentationMode,
    }),
    [presentationMode, togglePresentationMode],
  );

  return (
    <ControlPresentationContext.Provider value={value}>{children}</ControlPresentationContext.Provider>
  );
}

export function useControlPresentation(): ControlPresentationContextValue {
  const ctx = useContext(ControlPresentationContext);
  if (!ctx) {
    throw new Error('useControlPresentation must be used within ControlPresentationProvider');
  }
  return ctx;
}
