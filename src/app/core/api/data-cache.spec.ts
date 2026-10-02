import { AxiosError, AxiosResponse } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CacheMissError, DATA_CACHE_PREFIX, DATA_CACHE_TTL_MS, DataValidationError, fetchWithCache, invalidateDataCache, SessionChangedError } from './data-cache';
import { OfflineError } from './api-errors';
import { clearSession, readCacheScope, saveSession } from './session-storage';

const session = (id = 1) => ({ id, username: `user${id}`, accessToken: String(id).repeat(64), expiresAt: Math.floor(Date.now() / 1000) + 7200 });
const projection = (value: unknown): string[] => {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) throw new DataValidationError();
  return [...value];
};
const offline = () => Promise.reject(new OfflineError());
const read = (load: () => Promise<unknown> = async () => ['actual']) =>
  fetchWithCache('test', readCacheScope(), readCacheScope, load, projection);
const storedKey = () => Object.keys(sessionStorage).find(key => key.startsWith(DATA_CACHE_PREFIX))!;

describe('Caché temporal de datos', () => {
  beforeEach(() => { clearSession(); sessionStorage.clear(); saveSession(session()); });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); clearSession(); });

  it('prefiere red y luego recupera una copia sin cambiar la fecha original', async () => {
    const original = await read();
    expect(original).toMatchObject({ data: ['actual'], source: 'network', storage: 'session' });
    const cached = await read(offline);
    expect(cached).toMatchObject({ data: ['actual'], source: 'cache', savedAt: original.savedAt });
    expect(cached.reason).toContain('Sin conexión');
    expect((await read(async () => ['nuevo'])).data).toEqual(['nuevo']);
    expect((await read(offline)).data).toEqual(['nuevo']);
  });

  it('explica que no hay copia al fallar la primera consulta', async () => {
    await expect(read(offline)).rejects.toThrow('No hay una copia temporal válida');
  });

  it.each(['{', 'null', '{"version":99}', '{"version":1,"data":[]}'])('descarta una copia dañada: %s', async raw => {
    await read();
    const key = storedKey();
    sessionStorage.setItem(key, raw);
    await expect(read(offline)).rejects.toBeInstanceOf(CacheMissError);
    expect(sessionStorage.getItem(key)).toBeNull();
  });

  it('no utiliza datos malformados dentro de una copia con metadatos válidos', async () => {
    await read();
    const key = storedKey();
    const entry = JSON.parse(sessionStorage.getItem(key)!);
    sessionStorage.setItem(key, JSON.stringify({ ...entry, data: [123] }));
    await expect(read(offline)).rejects.toBeInstanceOf(CacheMissError);
  });

  it('caduca al cumplirse una hora y no renueva el TTL al leer offline', async () => {
    vi.useFakeTimers();
    await read();
    vi.advanceTimersByTime(DATA_CACHE_TTL_MS - 1);
    expect((await read(offline)).source).toBe('cache');
    vi.advanceTimersByTime(1);
    await expect(read(offline)).rejects.toBeInstanceOf(CacheMissError);
  });

  it('descarta fechas futuras', async () => {
    await read();
    const key = storedKey();
    const entry = JSON.parse(sessionStorage.getItem(key)!);
    sessionStorage.setItem(key, JSON.stringify({ ...entry, savedAt: Date.now() + 60_000 }));
    await expect(read(offline)).rejects.toBeInstanceOf(CacheMissError);
  });

  it('no comparte copias entre cuentas ni entre logins de la misma cuenta', async () => {
    await read();
    const oldScope = readCacheScope();
    saveSession(session(2));
    expect(readCacheScope()).not.toBe(oldScope);
    await expect(read(offline)).rejects.toBeInstanceOf(CacheMissError);
    await read();
    saveSession(session(2));
    await expect(read(offline)).rejects.toBeInstanceOf(CacheMissError);
  });

  it('permite iniciar sesión y cachear en HTTP LAN sin crypto.randomUUID', async () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    try {
      saveSession(session());
      expect(readCacheScope()).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
      await read();
      expect((await read(offline)).data).toEqual(['actual']);
    } finally { vi.unstubAllGlobals(); }
  });

  it('elimina datos al cerrar sesión sin tocar otras claves del navegador', async () => {
    await read();
    sessionStorage.setItem('otra-app', 'conservar');
    clearSession();
    expect(storedKey()).toBeUndefined();
    expect(sessionStorage.getItem('otra-app')).toBe('conservar');
    saveSession(session());
    await expect(read(offline)).rejects.toBeInstanceOf(CacheMissError);
  });

  it('un nuevo login no reutiliza la copia si el navegador impidió eliminarla', async () => {
    await read();
    const oldScope = readCacheScope();
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    saveSession(session());
    expect(readCacheScope()).not.toBe(oldScope);
    await expect(read(offline)).rejects.toBeInstanceOf(CacheMissError);
  });

  it('tolera cuota agotada y conserva en memoria la respuesta más reciente', async () => {
    await read();
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key.startsWith(DATA_CACHE_PREFIX)) throw new DOMException('full', 'QuotaExceededError');
      original.call(this, key, value);
    });
    const fresh = await read(async () => ['memoria']);
    expect(fresh.storage).toBe('memory');
    expect(await read(offline)).toMatchObject({ data: ['memoria'], storage: 'memory', source: 'cache' });
  });

  it('utiliza memoria si posteriormente se bloquea la lectura de la caché', async () => {
    await read();
    const original = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key) {
      if (key.startsWith(DATA_CACHE_PREFIX)) throw new DOMException('blocked', 'SecurityError');
      return original.call(this, key);
    });
    expect(await read(offline)).toMatchObject({ data: ['actual'], storage: 'memory', source: 'cache' });
  });

  it.each([401, 403, 404, 400, 429])('no oculta un error HTTP %s usando la caché', async status => {
    await read();
    const error = new AxiosError('HTTP', 'ERR_BAD_REQUEST', undefined, {}, { status, data: {} } as AxiosResponse);
    await expect(read(() => Promise.reject(error))).rejects.toBe(error);
    await expect(read(offline)).rejects.toBeInstanceOf(CacheMissError);
  });

  it.each([500, 503])('permite copia ante HTTP %s', async status => {
    await read();
    const error = new AxiosError('HTTP', 'ERR_BAD_RESPONSE', undefined, {}, { status, data: {} } as AxiosResponse);
    expect((await read(() => Promise.reject(error))).source).toBe('cache');
  });

  it.each(['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'])('permite copia ante %s', async code => {
    await read();
    expect((await read(() => Promise.reject(new AxiosError('fail', code)))).source).toBe('cache');
  });

  it('no esconde datos de red malformados detrás de una copia antigua', async () => {
    await read();
    await expect(read(async () => [123])).rejects.toBeInstanceOf(DataValidationError);
    await expect(read(offline)).rejects.toBeInstanceOf(CacheMissError);
  });

  it('no guarda ni entrega una respuesta que llega después de cerrar sesión', async () => {
    let finish!: (value: unknown) => void;
    const pending = read(() => new Promise(resolve => { finish = resolve; }));
    clearSession();
    saveSession(session(2));
    finish(['sesión anterior']);
    await expect(pending).rejects.toBeInstanceOf(SessionChangedError);
    await expect(read(offline)).rejects.toBeInstanceOf(CacheMissError);
  });

  it('una consulta anterior a una mutación no repuebla una copia invalidada', async () => {
    let finish!: (value: unknown) => void;
    const pending = read(() => new Promise(resolve => { finish = resolve; }));
    invalidateDataCache('test', readCacheScope());
    finish(['anterior a escritura']);
    await pending;
    await expect(read(offline)).rejects.toBeInstanceOf(CacheMissError);
  });

  it('una copia invalidada no vuelve a usarse aunque removeItem esté bloqueado', async () => {
    await read();
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    invalidateDataCache('test', readCacheScope());
    await expect(read(offline)).rejects.toBeInstanceOf(CacheMissError);
    await read(async () => ['confirmado']);
    expect((await read(offline)).data).toEqual(['confirmado']);
  });
});
