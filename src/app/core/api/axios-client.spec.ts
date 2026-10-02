import { AxiosError, CanceledError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api from './axios-client';
import { EXPIRY_KEY, TOKEN_KEY } from './session-storage';
import { OfflineError } from './api-errors';
import { connectionState } from './connection-state';

describe('Cliente Axios', () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.dispatchEvent(new Event('online'));
    connectionState.markApiAvailable();
  });

  afterEach(() => {
    window.dispatchEvent(new Event('online'));
    connectionState.markApiAvailable();
  });

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

  it('rechaza lecturas y escrituras sin conexión antes de llamar al adaptador', async () => {
    const adapter = vi.fn();
    window.dispatchEvent(new Event('offline'));
    await expect(api.get('/users', { adapter })).rejects.toBeInstanceOf(OfflineError);
    await expect(api.post('/users', { username: 'demo' }, { adapter })).rejects.toBeInstanceOf(OfflineError);
    expect(adapter).not.toHaveBeenCalled();
  });

  it.each(['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'])('detecta %s sin volver a enviar una escritura', async (code) => {
    const adapter = vi.fn(async () => { throw new AxiosError('Private detail', code); });
    await expect(api.post('/users', { username: 'demo' }, { adapter })).rejects.toMatchObject({ code });
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(connectionState.apiUnavailable()).toBe(true);
  });

  it('detecta una respuesta 503 y recupera el estado al recibir datos', async () => {
    await expect(api.get('/users', {
      adapter: async (config) => {
        throw new AxiosError('Unavailable', 'ERR_BAD_RESPONSE', config, undefined, { config, data: {}, headers: {}, status: 503, statusText: 'Unavailable' });
      },
    })).rejects.toMatchObject({ response: { status: 503 } });
    expect(connectionState.apiUnavailable()).toBe(true);
    await api.get('/users', {
      adapter: async (config) => ({ config, data: [], headers: {}, status: 200, statusText: 'OK' }),
    });
    expect(connectionState.apiUnavailable()).toBe(false);
  });

  it('una respuesta 403 confirma que el servidor es accesible, aunque rechace la acción', async () => {
    connectionState.markApiUnavailable();
    await expect(api.get('/users', {
      adapter: async (config) => {
        throw new AxiosError('Forbidden', 'ERR_BAD_REQUEST', config, undefined, { config, data: {}, headers: {}, status: 403, statusText: 'Forbidden' });
      },
    })).rejects.toMatchObject({ response: { status: 403 } });
    expect(connectionState.apiUnavailable()).toBe(false);
  });

  it('cancelar una petición no marca una caída del servicio', async () => {
    await expect(api.get('/users', { adapter: async () => { throw new CanceledError(); } })).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    expect(connectionState.apiUnavailable()).toBe(false);
  });
});
