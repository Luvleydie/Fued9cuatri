import { beforeEach, describe, expect, it } from 'vitest';
import api from './axios-client';
import { EXPIRY_KEY, TOKEN_KEY } from './session-storage';

describe('Cliente Axios', () => {
  beforeEach(() => sessionStorage.clear());

  it('envía el token vigente, consulta el almacenamiento en cada petición y respeta el timeout', async () => {
    const requestHeaders: Array<string | undefined> = [];
    const request = () => api.get('/auth/me', {
      adapter: async (config) => {
        requestHeaders.push(config.headers.get('Authorization') as string | undefined);
        expect(config.timeout).toBe(15000);
        expect(config.headers.get('Accept')).toBe('application/json');
        return { config, data: {}, headers: {}, status: 200, statusText: 'OK' };
      },
    });
    await request();
    const value = 'a'.repeat(64);
    sessionStorage.setItem(TOKEN_KEY, value);
    sessionStorage.setItem(EXPIRY_KEY, String(Date.now() / 1000 + 3600));
    await request();
    sessionStorage.removeItem(TOKEN_KEY);
    await request();
    expect(requestHeaders).toEqual([undefined, `Bearer ${value}`, undefined]);
  });

  it('no adjunta un token vencido', async () => {
    sessionStorage.setItem(TOKEN_KEY, 'a'.repeat(64));
    sessionStorage.setItem(EXPIRY_KEY, '1');
    await api.get('/users', {
      adapter: async (config) => {
        expect(config.headers.has('Authorization')).toBe(false);
        return { config, data: {}, headers: {}, status: 200, statusText: 'OK' };
      },
    });
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});
