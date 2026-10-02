import { Signal, signal } from '@angular/core';

/** El navegador informa de la red; sólo una respuesta confirma el estado de la API. */
export class ConnectionState {
  private readonly offlineValue = signal(false);
  private readonly apiUnavailableValue = signal(false);
  readonly offline: Signal<boolean> = this.offlineValue.asReadonly();
  readonly apiUnavailable: Signal<boolean> = this.apiUnavailableValue.asReadonly();

  private readonly handleOnline = (): void => { this.offlineValue.set(false); };
  private readonly handleOffline = (): void => { this.offlineValue.set(true); };

  constructor(private readonly browser: Window | undefined = typeof window === 'undefined' ? undefined : window) {
    this.offlineValue.set(browser?.navigator.onLine === false);
    browser?.addEventListener('online', this.handleOnline);
    browser?.addEventListener('offline', this.handleOffline);
  }

  markApiUnavailable(): void {
    this.apiUnavailableValue.set(true);
  }

  markApiAvailable(): void {
    this.apiUnavailableValue.set(false);
  }

  destroy(): void {
    this.browser?.removeEventListener('online', this.handleOnline);
    this.browser?.removeEventListener('offline', this.handleOffline);
  }
}

// Una sola suscripción a los eventos durante toda la vida de la aplicación.
export const connectionState = new ConnectionState();
