import { User } from '../../models/user.model';
import { AuthResponse } from '../../models/auth-response.model';
import { clearDataCache } from './data-cache';

export const TOKEN_KEY = 'novacart.accessToken';
export const USER_KEY = 'novacart.user';
export const EXPIRY_KEY = 'novacart.expiresAt';
export const CACHE_SCOPE_KEY = 'novacart.cacheScope';
let memoryScope: { token: string; userId: number; scope: string } | null = null;
let ignoreStoredScope = false;

function createCacheScope(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // HTTP en una LAN puede disponer de getRandomValues pero no de randomUUID.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function clearSession(): void {
  memoryScope = null;
  ignoreStoredScope = true;
  clearDataCache();
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(EXPIRY_KEY);
    sessionStorage.removeItem(CACHE_SCOPE_KEY);
  } catch { /* El navegador puede deshabilitar el almacenamiento. */ }
  clearLegacySession();
}

function clearLegacySession(): void {
  try {
    // Retirar sólo la sesión anterior; conservar el resto de datos del navegador.
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch { /* La sesión nueva nunca depende de localStorage. */ }
}

export function saveSession(response: AuthResponse): void {
  // Ni otra cuenta ni un login nuevo de la misma cuenta reutilizan datos anteriores.
  clearSession();
  try {
    const user = toUser(response);
    if (typeof response.accessToken !== 'string') throw new Error('Token inválido.');
    sessionStorage.setItem(TOKEN_KEY, response.accessToken);
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    sessionStorage.setItem(EXPIRY_KEY, String(response.expiresAt));
    if (!readToken()) throw new Error('Sesión vencida.');
    clearLegacySession();
    readCacheScope();
  } catch {
    clearSession();
    throw new Error('No fue posible guardar la sesión. Permite sessionStorage e inténtalo de nuevo.');
  }
}

/** Identificador público aleatorio; ningún token ni contraseña se escribe en la caché. */
export function readCacheScope(): string | null {
  const token = readToken();
  const user = readUser();
  if (!token || !user) return null;
  if (memoryScope?.token === token && memoryScope.userId === user.id) return memoryScope.scope;
  if (memoryScope) {
    clearDataCache();
    ignoreStoredScope = true;
    try { sessionStorage.removeItem(CACHE_SCOPE_KEY); } catch { /* Nueva identidad sólo en memoria. */ }
  }
  let scope: string | null = null;
  try {
    const stored = JSON.parse(sessionStorage.getItem(CACHE_SCOPE_KEY) || 'null') as { userId?: unknown; scope?: unknown } | null;
    if (!ignoreStoredScope && stored?.userId === user.id && typeof stored.scope === 'string' && /^[a-f0-9-]{36}$/.test(stored.scope)) scope = stored.scope;
  } catch { /* Un identificador dañado produce una sesión de caché nueva. */ }
  scope ??= createCacheScope();
  ignoreStoredScope = false;
  memoryScope = { token, userId: user.id, scope };
  try { sessionStorage.setItem(CACHE_SCOPE_KEY, JSON.stringify({ userId: user.id, scope })); } catch { /* Sólo memoria. */ }
  return scope;
}

export function readToken(): string | null {
  try {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    const expires = Number(sessionStorage.getItem(EXPIRY_KEY));
    if (!/^[a-f0-9]{64}$/.test(token) || !Number.isFinite(expires) || expires * 1000 <= Date.now()) {
      clearSession();
      return null;
    }
    return token;
  } catch {
    clearSession();
    return null;
  }
}

export function updateStoredUser(user: User): void {
  if (!readToken()) throw new Error('Sesión vencida.');
  sessionStorage.setItem(USER_KEY, JSON.stringify(toUser(user)));
}

// Validación del objeto recibido y proyección explícita de campos públicos.
// Nunca conservar credenciales aunque un servidor devuelva campos adicionales.
export function toUser(value: unknown): User {
  if (!value || typeof value !== 'object') throw new Error('Usuario no válido');
  const data = value as Record<string, unknown>;
  if (!Number.isSafeInteger(data['id']) || Number(data['id']) < 1 || typeof data['username'] !== 'string' || !data['username'].trim()) {
    throw new Error('Usuario no válido');
  }
  const user: User = { id: data['id'] as number, username: data['username'] };
  for (const field of ['email', 'firstName', 'lastName', 'image'] as const) {
    if (typeof data[field] === 'string') user[field] = data[field];
  }
  return user;
}

export function readUser(): User | null {
  try {
    if (!readToken()) { clearSession(); return null; }
    return toUser(JSON.parse(sessionStorage.getItem(USER_KEY) || 'null'));
  } catch {
    clearSession();
    return null;
  }
}
