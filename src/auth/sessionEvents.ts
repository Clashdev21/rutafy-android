type SessionListener = () => void;

const expiredListeners = new Set<SessionListener>();

export const sessionEvents = {
  onSessionExpired(listener: SessionListener): () => void {
    expiredListeners.add(listener);
    return () => expiredListeners.delete(listener);
  },
  emitSessionExpired(): void {
    expiredListeners.forEach((listener) => listener());
  },
};
