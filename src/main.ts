import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';

function registerOfflineShell(): void {
  if (!environment.production || !window.isSecureContext || !('serviceWorker' in navigator)) return;

  const register = (): void => {
    const scope = new URL('./', document.baseURI);
    void navigator.serviceWorker.register(new URL('offline-worker.js', scope).href, {
      scope: scope.href,
      updateViaCache: 'none',
    }).then(registration => {
      // Updated builds wait until existing tabs close; no forced reload can
      // interrupt a form or combine an old shell with new lazy modules.
      window.addEventListener('online', () => {
        void registration.update().catch(() => undefined);
      });
    }).catch(() => {
      console.warn('No se pudo preparar la recarga sin conexión. La aplicación puede seguir usándose en línea.');
    });
  };

  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

platformBrowserDynamic().bootstrapModule(AppModule)
  .then(() => registerOfflineShell())
  .catch(err => console.error('NovaCart no pudo iniciarse.', err));
