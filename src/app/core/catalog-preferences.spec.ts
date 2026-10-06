import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOG_PREFERENCES_KEY, CatalogPreferences, DEFAULT_CATALOG_PREFERENCES, normalizeCatalogSearch, readCatalogPreferences, saveCatalogPreferences } from './catalog-preferences';

describe('Preferencias locales del catálogo', () => {
  beforeEach(() => localStorage.removeItem(CATALOG_PREFERENCES_KEY));
  afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem(CATALOG_PREFERENCES_KEY); });

  it('devuelve valores iniciales independientes si no hay preferencias', () => {
    const preferences = readCatalogPreferences();
    expect(preferences).toEqual({ sort: 'default', availability: 'all' });
    preferences.sort = 'name';
    expect(DEFAULT_CATALOG_PREFERENCES.sort).toBe('default');
    expect(readCatalogPreferences().sort).toBe('default');
  });

  it('guarda y recupera sólo orden y disponibilidad de la versión vigente', () => {
    const preferences: CatalogPreferences & { searchQuery: string; username: string } = {
      sort: 'price-desc', availability: 'available', searchQuery: 'texto privado', username: 'persona',
    };
    expect(saveCatalogPreferences(preferences)).toBe(true);
    expect(JSON.parse(localStorage.getItem(CATALOG_PREFERENCES_KEY)!)).toEqual({ version: 1, sort: 'price-desc', availability: 'available' });
    expect(readCatalogPreferences()).toEqual({ sort: 'price-desc', availability: 'available' });
  });

  it.each(['{', 'null', '[]', '{"version":2,"sort":"name","availability":"all"}',
    '{"sort":"name","availability":"all"}', '{"version":1,"sort":"unknown","availability":"all"}',
    '{"version":1,"sort":"name","availability":"unknown"}', '{"version":1,"sort":"name"}'])
  ('descarta preferencias dañadas o incompatibles: %s', raw => {
    localStorage.setItem(CATALOG_PREFERENCES_KEY, raw);
    expect(readCatalogPreferences()).toEqual(DEFAULT_CATALOG_PREFERENCES);
  });

  it('continúa con valores iniciales cuando el navegador impide leer almacenamiento', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
    expect(readCatalogPreferences()).toEqual(DEFAULT_CATALOG_PREFERENCES);
  });

  it('no lanza un error si se agota el almacenamiento al guardar', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    expect(saveCatalogPreferences({ sort: 'name', availability: 'all' })).toBe(false);
  });

  it('normaliza acentos, mayúsculas y espacios entre palabras para buscar', () => {
    expect(normalizeCatalogSearch('  RATÓN   Óptico\t ')).toBe('raton optico');
    expect(normalizeCatalogSearch('Audífonos INÁLAMBRICOS')).toBe('audifonos inalambricos');
  });
});
