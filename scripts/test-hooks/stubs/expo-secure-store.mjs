/** Stub in-memory de expo-secure-store. */
const store = new Map();

export async function getItemAsync(key) {
  return store.has(key) ? store.get(key) : null;
}

export async function setItemAsync(key, value) {
  store.set(key, String(value));
}

export async function deleteItemAsync(key) {
  store.delete(key);
}

export function __reset() {
  store.clear();
}
