import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, readToken, readUser, saveSession, TOKEN_KEY, toUser, USER_KEY, EXPIRY_KEY } from './session-storage';

const session = () => ({ id: 1, username: 'emilys', accessToken: 'a'.repeat(64), expiresAt: Math.floor(Date.now() / 1000) + 3600 });

describe('Almacenamiento de sesión', () => {
  beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });
  afterEach(() => vi.restoreAllMocks());

  it('guarda y restaura token, vencimiento y campos públicos', () => {
    const response = session();
    saveSession({ ...response, firstName: 'Emily' });
    expect(readToken()).toBe(response.accessToken);
    expect(readUser()).toEqual({ id: 1, username: 'emilys', firstName: 'Emily' });
    expect(sessionStorage.getItem(EXPIRY_KEY)).toBe(String(response.expiresAt));
  });

  it.each(['broken', 'header.payload.signature', ''])('elimina sesión con token inválido: %s', value => {
    saveSession(session());
    sessionStorage.setItem(TOKEN_KEY, value);
    expect(readUser()).toBeNull();
    expect(sessionStorage.getItem(USER_KEY)).toBeNull();
  });

  it.each(['0', 'NaN', '1'])('elimina sesión vencida o dañada: %s', value => {
    saveSession(session());
    sessionStorage.setItem(EXPIRY_KEY, value);
    expect(readToken()).toBeNull();
    expect(sessionStorage.getItem(USER_KEY)).toBeNull();
  });

  it.each(['{', 'null', '{"id":1}', '{"id":"1","username":"emilys"}'])('invalida un perfil dañado: %s', raw => {
    saveSession(session());
    sessionStorage.setItem(USER_KEY, raw);
    expect(readUser()).toBeNull();
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('no proyecta credenciales ni campos sensibles', () => {
    expect(toUser({ id: 1, username: 'emilys', password: 'secret', accessToken: 'token' }))
      .toEqual({ id: 1, username: 'emilys' });
  });

  it('retira solo la sesión local antigua; la pestaña nueva requiere login', () => {
    localStorage.setItem(TOKEN_KEY, 'legacy');
    localStorage.setItem(USER_KEY, '{}');
    localStorage.setItem('novacart.cart', '[]');
    saveSession(session());
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(USER_KEY)).toBeNull();
    expect(localStorage.getItem('novacart.cart')).toBe('[]');
    sessionStorage.clear();
    expect(readUser()).toBeNull();
  });

  it('limpia una sesión incompleta si el guardado falla', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => saveSession(session())).toThrow('guardar la sesión');
    expect(readUser()).toBeNull();
  });

  it('tolera almacenamiento bloqueado', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readToken()).toBeNull();
    expect(readUser()).toBeNull();
    expect(() => clearSession()).not.toThrow();
  });
});
