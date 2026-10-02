import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');

// Only public build files belong here. API responses and browser storage are
// deliberately outside this manifest, including any JSON/PHP/source-map files.
function isPublicAsset(file) {
  if (file === 'index.html') return true;
  if (!file.includes('/')) return /\.(?:js|mjs|css)$/.test(file) && file !== 'offline-worker.js';
  return /^(?:assets|svg|media)\/.+\.(?:svg|png|webp|jpe?g|gif|avif|ico|woff2?|ttf|otf|eot)$/.test(file);
}

async function listAssets(directory, relative = '') {
  const files = [];
  for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
    const file = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory() && /^(?:assets|svg|media)(?:\/|$)/.test(file)) {
      files.push(...await listAssets(directory, file));
    } else if (entry.isFile() && isPublicAsset(file)) {
      files.push(file);
    }
  }
  return files.sort();
}

// This function is serialized into the generated, dependency-free worker.
function offlineWorker(manifest, version) {
  const scope = new URL(self.registration.scope);
  const prefix = `novacart-shell:${encodeURIComponent(scope.pathname)}:`;
  const cacheName = prefix + version;
  const shell = new URL('index.html', scope).href;
  const assets = new Set(manifest.map(entry => new URL(entry.file, scope).href));
  // Keep this list aligned with the application's public SPA route names.
  const routes = new Set(['', 'index', 'index.html', 'login', 'register', 'home', 'cart']);

  self.addEventListener('install', event => {
    event.waitUntil((async () => {
      const existed = await caches.has(cacheName);
      const cache = await caches.open(cacheName);
      try {
        // Limit parallel requests: Ionic ships many SVG icons and lazy chunks.
        let next = 0;
        const results = await Promise.allSettled(Array.from({ length: 8 }, async () => {
          while (next < manifest.length) {
            const entry = manifest[next++];
            const url = new URL(entry.file, scope).href;
            const response = await fetch(new Request(url, {
              cache: 'reload', credentials: 'omit', redirect: 'error',
            }));
            if (!response.ok || response.type === 'opaque') throw new Error('Recurso sin conexión no disponible.');
            const hash = await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer());
            const revision = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
            if (revision !== entry.revision) throw new Error('El despliegue cambió durante la instalación.');
            await cache.put(url, response);
          }
        }));
        const failure = results.find(result => result.status === 'rejected');
        if (failure) throw failure.reason;
      } catch (error) {
        if (!existed) await caches.delete(cacheName);
        throw error;
      }
      // Do not skipWaiting: open tabs must finish using their existing build.
    })());
  });

  self.addEventListener('activate', event => {
    event.waitUntil((async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith(prefix) && key !== cacheName) await caches.delete(key);
      }
      await self.clients.claim();
    })());
  });

  self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== 'GET' || request.headers.has('Authorization') ||
        url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;

    const relative = url.pathname.slice(scope.pathname.length).replace(/\/$/, '');
    const navigation = request.mode === 'navigate' && routes.has(relative);
    // Unlisted requests (especially api/* and auth/*) use the network directly.
    if (!navigation && !assets.has(url.href)) return;

    event.respondWith((async () => {
      const cache = await caches.open(cacheName);
      // A shell and its lazy modules always come from the same build. Runtime
      // responses are never stored, even when the browser evicts an asset.
      return await cache.match(navigation ? shell : url.href) || fetch(request);
    })());
  });
}

export async function buildOfflineWorker(directory = path.join(root, 'www')) {
  const files = await listAssets(directory);
  if (!files.includes('index.html')) throw new Error('Falta index.html: ejecuta primero ng build.');
  const manifest = await Promise.all(files.map(async file => ({
    file,
    revision: digest(await readFile(path.join(directory, file))),
  })));
  const implementation = offlineWorker.toString();
  const version = digest(implementation + JSON.stringify(manifest)).slice(0, 20);
  await writeFile(path.join(directory, 'offline-worker.js'),
    `// Generated by scripts/build-offline.mjs. Public build assets only.\n(${implementation})(${JSON.stringify(manifest)}, ${JSON.stringify(version)});\n`);
  return { version, files: manifest.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await buildOfflineWorker(process.argv[2] ? path.resolve(process.argv[2]) : undefined);
  console.log(`Offline shell: ${result.files} recursos, versión ${result.version}.`);
}
