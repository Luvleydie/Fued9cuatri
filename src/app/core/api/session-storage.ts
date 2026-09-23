import { User } from '../../models/user.model';
import { AuthResponse } from '../../models/auth-response.model';

export const TOKEN_KEY = 'novacart.accessToken';
export const USER_KEY = 'novacart.user';
export const EXPIRY_KEY = 'novacart.expiresAt';

export function clearSession(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(EXPIRY_KEY);
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
  try {
    const user = toUser(response);
    if (typeof response.accessToken !== 'string') throw new Error('Token inválido.');
    sessionStorage.setItem(TOKEN_KEY, response.accessToken);
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    sessionStorage.setItem(EXPIRY_KEY, String(response.expiresAt));
    if (!readToken()) throw new Error('Sesión vencida.');
    clearLegacySession();
  } catch {
    clearSession();
    throw new Error('No fue posible guardar la sesión. Permite sessionStorage e inténtalo de nuevo.');
  }
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
