import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, readToken, readUser, TOKEN_KEY, toUser, USER_KEY } from './session-storage';

const token = (exp = Math.floor(Date.now() / 1000) + 3600) =>
  `header.${btoa(JSON.stringify({ exp }))}.signature`;

describe('Almacenamiento de sesión', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('restaura una sesión vigente y conserva sólo los campos públicos del usuario', () => {
    const accessToken = token();
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify({ id: 1, username: 'emilys', firstName: 'Emily', password: 'demo', bank: { cardNumber: '123' } }));
    expect(readToken()).toBe(accessToken);
    expect(readUser()).toEqual({ id: 1, username: 'emilys', firstName: 'Emily' });
  });

  it.each(['broken', 'header.invalid.signature', token(1)])('elimina la sesión con un token inválido o vencido', (value) => {
    localStorage.setItem(TOKEN_KEY, value);
    localStorage.setItem(USER_KEY, JSON.stringify({ id: 1, username: 'emilys' }));
    expect(readToken()).toBeNull();
    expect(localStorage.getItem(USER_KEY)).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it.each(['{', 'null', '{"id":1}', '{"id":"1","username":"emilys"}'])('invalida la sesión si el usuario persistido está dañado: %s', (raw) => {
    localStorage.setItem(TOKEN_KEY, token());
    localStorage.setItem(USER_KEY, raw);
    expect(readUser()).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('no expone datos sensibles provenientes de /auth/me', () => {
    expect(toUser({ id: 1, username: 'emilys', email: 'emily@example.test', password: 'secret', accessToken: 'token', ssn: '123' }))
      .toEqual({ id: 1, username: 'emilys', email: 'emily@example.test' });
  });

  it('borra únicamente la sesión y tolera almacenamiento bloqueado', () => {
    localStorage.setItem('novacart.cart', '[]');
    localStorage.setItem(TOKEN_KEY, token());
    clearSession();
    expect(localStorage.getItem('novacart.cart')).toBe('[]');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readToken()).toBeNull();
    expect(readUser()).toBeNull();
    expect(() => clearSession()).not.toThrow();
  });
});
