import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectionState } from './connection-state';

describe('Estado de conexión', () => {
  let state: ConnectionState | undefined;

  afterEach(() => {
    state?.destroy();
    window.dispatchEvent(new Event('online'));
    vi.restoreAllMocks();
  });

  it('detecta el arranque sin red y reacciona a los eventos del navegador', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    state = new ConnectionState(window);
    expect(state.offline()).toBe(true);
    window.dispatchEvent(new Event('online'));
    expect(state.offline()).toBe(false);
    window.dispatchEvent(new Event('offline'));
    expect(state.offline()).toBe(true);
  });

  it('no confunde recuperar la red con confirmar que la API funciona', () => {
    state = new ConnectionState(window);
    state.markApiUnavailable();
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
    expect(state.offline()).toBe(false);
    expect(state.apiUnavailable()).toBe(true);
    state.markApiAvailable();
    expect(state.apiUnavailable()).toBe(false);
  });

  it('retira los listeners al destruir una instancia', () => {
    state = new ConnectionState(window);
    state.destroy();
    window.dispatchEvent(new Event('offline'));
    expect(state.offline()).toBe(false);
  });
});
