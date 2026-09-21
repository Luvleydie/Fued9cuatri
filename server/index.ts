import { resolve } from 'node:path';
import { createApplication } from './app';
import { PROJECT_ROOT } from './database';

const port = Number(process.env['PORT'] ?? '3001');
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT debe ser un entero entre 1 y 65535.');
  process.exitCode = 1;
} else {
  try {
    const application = createApplication({
      databasePath: process.env['DB_PATH'] ? resolve(process.env['DB_PATH']) : resolve(PROJECT_ROOT, 'server/data/novacart.sqlite'),
      staticDirectory: resolve(PROJECT_ROOT, 'www'),
    });
    application.server.on('error', () => {
      console.error('No fue posible iniciar NovaCart. Comprueba el puerto configurado.');
      void application.close().finally(() => { process.exitCode = 1; });
    });
    application.server.listen(port, '127.0.0.1', () => {
      console.log(`NovaCart API y sitio: http://127.0.0.1:${port}`);
    });
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.once(signal, () => { void application.close().then(() => { process.exitCode = 0; }); });
    }
  } catch {
    console.error('No fue posible abrir la base de datos. Comprueba DB_PATH y los permisos del directorio.');
    process.exitCode = 1;
  }
}
