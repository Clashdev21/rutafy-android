/**
 * Registra los hooks ESM para que node:test pueda importar módulos productivos
 * reales de src/ sin bundler.
 *
 * Uso: node --import ./scripts/test-hooks/register.mjs --test scripts/xxx.ts
 *
 * Cero dependencias nuevas: usa module.register de Node.
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

if (typeof globalThis.__DEV__ === 'undefined') {
  globalThis.__DEV__ = false;
}

register('./resolve-hooks.mjs', pathToFileURL(import.meta.filename));
