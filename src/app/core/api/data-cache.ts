import { getErrorMessage, isRecoverableReadError } from './api-errors';

export interface CachedResult<T> {
  data: T;
  source: 'network' | 'cache';
  savedAt: number;
  storage: 'session' | 'memory';
  reason?: string;
}

export const DATA_CACHE_PREFIX = 'novacart.data.v1.';
export const DATA_CACHE_TTL_MS = 60 * 60 * 1000;
type Projection<T> = (value: unknown) => T;
interface CacheEntry { version: number; scope: string; savedAt: number; data: unknown }
interface MemoryEntry { raw: string; storage: 'session' | 'memory' }
const memory = new Map<string, MemoryEntry>();
const revisions = new Map<string, number>();
const invalidated = new Set<string>();
let generation = 0;

export class DataValidationError extends Error {
  constructor() {
    super('Los datos recibidos no tienen un formato válido. Inténtalo de nuevo.');
    this.name = 'DataValidationError';
  }
}

export class SessionChangedError extends Error {
  constructor() {
    super('Tu sesión cambió. Inicia sesión e inténtalo de nuevo.');
    this.name = 'SessionChangedError';
  }
}

export class CacheMissError extends Error {
  constructor(error: unknown) {
    super(`${getErrorMessage(error, 'No fue posible consultar los datos.')} No hay una copia temporal válida. Conéctate e inténtalo de nuevo.`, { cause: error });
    this.name = 'CacheMissError';
  }
}

/** También protege los rechazos: un 401 tardío no pertenece a la sesión nueva. */
export async function runSessionMutation<T>(scope: string | null, currentScope: () => string | null, action: () => Promise<T>): Promise<T> {
  const startedGeneration = generation;
  const assertSession = () => {
    if (generation !== startedGeneration || currentScope() !== scope) throw new SessionChangedError();
  };
  try {
    const result = await action();
    assertSession();
    return result;
  } catch (error) {
    assertSession();
    throw error;
  }
}

function cacheKey(resource: string, scope: string): string {
  return `${DATA_CACHE_PREFIX}${scope}.${resource}`;
}

function removeEntry(key: string): void {
  memory.delete(key);
  // removeItem puede fallar: no volver a leer la copia persistida ya invalidada.
  invalidated.add(key);
  try { sessionStorage.removeItem(key); } catch { /* La copia en memoria ya se eliminó. */ }
}

export function clearDataCache(): void {
  generation++;
  memory.clear();
  revisions.clear();
  invalidated.clear();
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(DATA_CACHE_PREFIX)) sessionStorage.removeItem(key);
    }
  } catch { /* El cambio de generación invalida también las consultas pendientes. */ }
}

export function invalidateDataCache(resource: string, scope: string | null): void {
  if (!scope) return;
  const key = cacheKey(resource, scope);
  revisions.set(key, (revisions.get(key) ?? 0) + 1);
  removeEntry(key);
}

function persist<T>(resource: string, scope: string, data: T, savedAt: number): 'session' | 'memory' {
  const key = cacheKey(resource, scope);
  const raw = JSON.stringify({ version: 1, scope, savedAt, data } satisfies CacheEntry);
  let storage: 'session' | 'memory' = 'session';
  try { sessionStorage.setItem(key, raw); } catch {
    storage = 'memory';
    // Una escritura rechazada no debe dejar que una copia anterior oculte la nueva.
    try { sessionStorage.removeItem(key); } catch { /* Se prioriza memory debajo. */ }
  }
  memory.set(key, { raw, storage });
  invalidated.delete(key);
  return storage;
}

export function replaceDataCache<T>(resource: string, scope: string | null, value: unknown, project: Projection<T>): void {
  if (!scope) return;
  const data = project(value);
  invalidateDataCache(resource, scope);
  persist(resource, scope, data, Date.now());
}

function readDataCache<T>(resource: string, scope: string, project: Projection<T>): CachedResult<T> | null {
  const key = cacheKey(resource, scope);
  if (invalidated.has(key)) return null;
  const fallback = memory.get(key);
  let raw = fallback?.raw ?? null;
  let storage: 'session' | 'memory' = 'memory';
  // Si falló la última escritura, la memoria tiene la respuesta más reciente.
  if (fallback?.storage !== 'memory') {
    try {
      const persisted = sessionStorage.getItem(key);
      raw = persisted ?? raw;
      storage = persisted ? 'session' : 'memory';
    } catch { /* Usar memoria si el navegador bloqueó el almacenamiento. */ }
  }
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as CacheEntry;
    if (!entry || entry.version !== 1 || entry.scope !== scope || typeof entry.savedAt !== 'number' ||
        !Number.isFinite(entry.savedAt) || entry.savedAt > Date.now() || Date.now() - entry.savedAt >= DATA_CACHE_TTL_MS) {
      throw new DataValidationError();
    }
    return { data: project(entry.data), source: 'cache', savedAt: entry.savedAt, storage };
  } catch {
    removeEntry(key);
    return null;
  }
}

/** La red manda; sólo errores recuperables permiten una copia de la misma sesión. */
export async function fetchWithCache<T>(
  resource: string,
  scope: string | null,
  currentScope: () => string | null,
  load: () => Promise<unknown>,
  project: Projection<T>,
): Promise<CachedResult<T>> {
  const startedGeneration = generation;
  const key = scope ? cacheKey(resource, scope) : '';
  const startedRevision = revisions.get(key) ?? 0;
  const assertSession = () => {
    if (generation !== startedGeneration || currentScope() !== scope) throw new SessionChangedError();
  };
  try {
    const raw = await load();
    assertSession();
    const data = project(raw);
    const savedAt = Date.now();
    const storage = scope && startedRevision === (revisions.get(key) ?? 0)
      ? persist(resource, scope, data, savedAt) : 'memory';
    return { data, source: 'network', savedAt, storage };
  } catch (error) {
    assertSession();
    if (!isRecoverableReadError(error)) {
      invalidateDataCache(resource, scope);
      throw error;
    }
    const cached = scope ? readDataCache(resource, scope, project) : null;
    if (cached) return { ...cached, reason: getErrorMessage(error, 'No fue posible actualizar los datos.') };
    throw new CacheMissError(error);
  }
}
