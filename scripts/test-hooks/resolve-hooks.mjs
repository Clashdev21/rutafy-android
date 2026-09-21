/**
 * Hooks de resolución ESM para tests con imports productivos reales.
 *
 * Responsabilidades (deliberadamente mínimas):
 *  1. Resolver el alias `@/x` → `<repo>/src/x` probando .ts/.tsx/index.
 *  2. Redirigir SOLO paquetes nativos hoja (Expo/React Native) a stubs locales.
 *
 * Lo que NO hace: no stubbea ningún módulo de `src/`. Todo módulo productivo
 * bajo prueba se carga real, que es el requisito de Fase A.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const HOOKS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HOOKS_DIR, '..', '..');
const SRC_ROOT = path.join(REPO_ROOT, 'src');
const STUBS_DIR = path.join(HOOKS_DIR, 'stubs');

/** Paquetes sin lógica de negocio: solo bindings de plataforma. */
const NATIVE_STUBS = new Map([
  ['react-native', 'react-native.mjs'],
  ['expo-secure-store', 'expo-secure-store.mjs'],
  ['expo-battery', 'expo-battery.mjs'],
  ['expo-constants', 'expo-constants.mjs'],
  ['expo-device', 'expo-device.mjs'],
  ['expo-location', 'expo-location.mjs'],
  ['expo-task-manager', 'expo-task-manager.mjs'],
  ['expo-application', 'expo-application.mjs'],
  ['expo-sensors', 'expo-sensors.mjs'],
  ['expo/fetch', 'expo-fetch.mjs'],
  ['@react-native-async-storage/async-storage', 'async-storage.mjs'],
]);

const CANDIDATE_SUFFIXES = ['', '.ts', '.tsx', '.mts', '.js', '/index.ts', '/index.tsx'];

function resolveSrcPath(relative) {
  const base = path.join(SRC_ROOT, relative);
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = suffix.startsWith('/')
      ? path.join(base, suffix.slice(1))
      : `${base}${suffix}`;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** .ts debe declararse como module-typescript para que Node aplique type stripping. */
function formatFor(filePath) {
  return /\.(ts|tsx|mts)$/.test(filePath) ? 'module-typescript' : 'module';
}

function hit(filePath) {
  return {
    url: pathToFileURL(filePath).href,
    shortCircuit: true,
    format: formatFor(filePath),
  };
}

/** Resuelve `./x` / `../x` sin extensión, que TypeScript permite y Node ESM no. */
function resolveRelativeWithoutExtension(specifier, parentURL) {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return null;
  if (!parentURL?.startsWith('file:')) return null;
  const base = path.resolve(path.dirname(fileURLToPath(parentURL)), specifier);
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = suffix.startsWith('/')
      ? path.join(base, suffix.slice(1))
      : `${base}${suffix}`;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  const stub = NATIVE_STUBS.get(specifier);
  if (stub) return hit(path.join(STUBS_DIR, stub));

  if (specifier.startsWith('@/')) {
    const resolved = resolveSrcPath(specifier.slice(2));
    if (resolved) return hit(resolved);
    throw new Error(`[test-hooks] alias no resuelto: ${specifier}`);
  }

  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const fallback = resolveRelativeWithoutExtension(specifier, context.parentURL);
    if (fallback) return hit(fallback);
    throw error;
  }
}
