export type CatalogSort = 'default' | 'name' | 'price-asc' | 'price-desc';
export type CatalogAvailability = 'all' | 'available' | 'unavailable';

export interface CatalogPreferences {
  sort: CatalogSort;
  availability: CatalogAvailability;
}

export const CATALOG_PREFERENCES_KEY = 'novacart.catalog.preferences.v1';
export const DEFAULT_CATALOG_PREFERENCES: Readonly<CatalogPreferences> = { sort: 'default', availability: 'all' };

export function isCatalogSort(value: unknown): value is CatalogSort {
  return value === 'default' || value === 'name' || value === 'price-asc' || value === 'price-desc';
}

export function isCatalogAvailability(value: unknown): value is CatalogAvailability {
  return value === 'all' || value === 'available' || value === 'unavailable';
}

export function normalizeCatalogSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim().replace(/\s+/g, ' ');
}

export function readCatalogPreferences(): CatalogPreferences {
  try {
    const raw = localStorage.getItem(CATALOG_PREFERENCES_KEY);
    if (raw) {
      const value: unknown = JSON.parse(raw);
      if (value !== null && typeof value === 'object' && 'version' in value && value.version === 1
        && 'sort' in value && isCatalogSort(value.sort)
        && 'availability' in value && isCatalogAvailability(value.availability)) {
        return { sort: value.sort, availability: value.availability };
      }
    }
  } catch { /* Si el almacenamiento está bloqueado o dañado, el catálogo conserva sus valores iniciales. */ }
  return { ...DEFAULT_CATALOG_PREFERENCES };
}

export function saveCatalogPreferences(preferences: CatalogPreferences): boolean {
  if (!isCatalogSort(preferences.sort) || !isCatalogAvailability(preferences.availability)) return false;
  try {
    // Únicamente se guardan preferencias visuales: no se persisten búsquedas, cuentas ni productos.
    localStorage.setItem(CATALOG_PREFERENCES_KEY, JSON.stringify({ version: 1, sort: preferences.sort, availability: preferences.availability }));
    return true;
  } catch { return false; }
}
