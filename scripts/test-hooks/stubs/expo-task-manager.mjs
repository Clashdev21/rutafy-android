/** Stub de expo-task-manager. */
const defined = new Map();

export function defineTask(name, executor) {
  defined.set(name, executor);
}

export function isTaskDefined(name) {
  return defined.has(name);
}

export async function isTaskRegisteredAsync(name) {
  return defined.has(name);
}

export async function unregisterTaskAsync(name) {
  defined.delete(name);
}

export async function getRegisteredTasksAsync() {
  return [...defined.keys()].map((taskName) => ({ taskName }));
}

export function __getTask(name) {
  return defined.get(name) ?? null;
}

export function __reset() {
  defined.clear();
}
