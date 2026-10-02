import { CachedResult } from './api/data-cache';

export function cacheNotice(result: CachedResult<unknown> | null, offline: boolean): string {
  if (!result) return '';
  const date = new Date(result.savedAt).toLocaleString('es-MX');
  const temporary = result.storage === 'memory'
    ? ' La copia está solo en memoria y se perderá al recargar.' : '';
  if (result.source === 'cache' || offline) {
    return `Mostrando copia temporal del ${date}. Puede estar desactualizada. Solo consulta; actualiza con conexión antes de guardar cambios.${temporary}`;
  }
  return `Última actualización: ${date}.${temporary}`;
}
