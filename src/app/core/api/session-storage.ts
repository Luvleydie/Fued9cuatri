import { User } from '../../models/user.model';

export const TOKEN_KEY = 'novacart.accessToken';
export const USER_KEY = 'novacart.user';

export function clearSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch { /* El navegador puede deshabilitar el almacenamiento. */ }
}

export function readToken(): string | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Token no válido');
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) {
      clearSession();
      return null;
    }
    return token;
  } catch {
    clearSession();
    return null;
  }
}

// Validación del objeto recibido y proyección explícita de campos públicos.
// Nunca conservar credenciales aunque un servidor devuelva campos adicionales.
export function toUser(value: unknown): User {
  if (!value || typeof value !== 'object') throw new Error('Usuario no válido');
  const data = value as Record<string, unknown>;
  if (!Number.isInteger(data['id']) || typeof data['username'] !== 'string' || !data['username']) {
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
    return toUser(JSON.parse(localStorage.getItem(USER_KEY) || 'null'));
  } catch {
    clearSession();
    return null;
  }
}
