/** Stub in-memory de AsyncStorage. */
const store = new Map();

const AsyncStorage = {
  async getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  async setItem(key, value) {
    store.set(key, String(value));
  },
  async removeItem(key) {
    store.delete(key);
  },
  async clear() {
    store.clear();
  },
  async getAllKeys() {
    return [...store.keys()];
  },
  async multiRemove(keys) {
    for (const key of keys) store.delete(key);
  },
  __reset() {
    store.clear();
  },
};

export default AsyncStorage;
