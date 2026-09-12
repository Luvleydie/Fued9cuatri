import { beforeEach, describe, expect, it } from 'vitest';
import api from './axios-client';
import { TOKEN_KEY } from './session-storage';

describe('Cliente Axios', () => {
  beforeEach(() => localStorage.clear());

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
    const value = `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.signature`;
    localStorage.setItem(TOKEN_KEY, value);
    await request();
    localStorage.removeItem(TOKEN_KEY);
    await request();
    expect(requestHeaders).toEqual([undefined, `Bearer ${value}`, undefined]);
  });

  it('no adjunta un token vencido', async () => {
    localStorage.setItem(TOKEN_KEY, `header.${btoa(JSON.stringify({ exp: 1 }))}.signature`);
    await api.get('/products', {
      adapter: async (config) => {
        expect(config.headers.has('Authorization')).toBe(false);
        return { config, data: {}, headers: {}, status: 200, statusText: 'OK' };
      },
    });
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});
