import { readFileSync, realpathSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { authenticate, login } from './auth';
import { Store } from './database';
import type { ApplicationOptions } from './types';
import { HttpError, validateId, validateLogin, validateProduct } from './validation';

export interface Application {
  server: Server;
  close(): Promise<void>;
}

const MAX_BODY_BYTES = 64 * 1024;
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.map': 'application/json; charset=utf-8',
};

function json(response: ServerResponse, status: number, body?: unknown): void {
  response.statusCode = status;
  response.setHeader('Cache-Control', 'no-store');
  if (body === undefined) { response.end(); return; }
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}

function methodOnly(request: IncomingMessage, response: ServerResponse, allowed: string[]): void {
  if (!allowed.includes(request.method ?? '')) {
    response.setHeader('Allow', allowed.join(', '));
    throw new HttpError(405, 'Método no permitido para esta ruta.');
  }
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const contentType = request.headers['content-type']?.split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') throw new HttpError(415, 'Envía el cuerpo con Content-Type: application/json.');
  const size = Number(request.headers['content-length'] ?? 0);
  if (size > MAX_BODY_BYTES) {
    request.resume();
    throw new HttpError(413, 'El cuerpo JSON supera el límite de 64 KiB.');
  }
  return new Promise<unknown>((resolveBody, reject) => {
    let chunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    request.on('data', (chunk: Buffer) => {
      if (settled) return;
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        settled = true;
        chunks = [];
        reject(new HttpError(413, 'El cuerpo JSON supera el límite de 64 KiB.'));
      } else chunks.push(chunk);
    });
    request.on('end', () => {
      if (settled) return;
      settled = true;
      try { resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown); }
      catch { reject(new HttpError(400, 'El cuerpo no contiene JSON válido.')); }
    });
    request.on('error', () => {
      if (!settled) { settled = true; reject(new HttpError(400, 'No fue posible leer la solicitud.')); }
    });
  });
}

function serveStatic(request: IncomingMessage, response: ServerResponse, pathname: string, directory?: string): void {
  if (!directory) throw new HttpError(404, 'Ruta no encontrada.');
  methodOnly(request, response, ['GET', 'HEAD']);
  const root = resolve(directory);
  let candidate = resolve(root, `.${pathname}`);
  const inside = relative(root, candidate);
  if (inside.startsWith('..') || isAbsolute(inside)) throw new HttpError(404, 'Ruta no encontrada.');
  try {
    if (statSync(candidate).isDirectory()) candidate = resolve(candidate, 'index.html');
  } catch {
    if (!extname(pathname) && request.headers.accept?.includes('text/html')) candidate = resolve(root, 'index.html');
  }
  let body: Buffer;
  try {
    const realRoot = realpathSync(root);
    const actual = realpathSync(candidate);
    const relativeActual = relative(realRoot, actual);
    if (relativeActual.startsWith('..') || isAbsolute(relativeActual) || !statSync(actual).isFile()) {
      throw new Error('Not a public file.');
    }
    body = readFileSync(actual);
  } catch {
    throw new HttpError(404, 'Archivo no encontrado.');
  }
  response.statusCode = 200;
  response.setHeader('Content-Type', MIME_TYPES[extname(candidate)] ?? 'application/octet-stream');
  response.setHeader('Content-Length', body.length);
  response.setHeader('Cache-Control', extname(candidate) === '.html' ? 'no-cache' : 'public, max-age=3600');
  response.end(request.method === 'HEAD' ? undefined : body);
}

export function createApplication(options: ApplicationOptions): Application {
  const store = new Store(options.databasePath);
  const now = (): number => Math.floor((options.now?.() ?? Date.now()) / 1000);

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      let pathname: string;
      try {
        pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
      } catch { throw new HttpError(400, 'La URL no es válida.'); }
      if (/[\\\u0000]/u.test(pathname)) throw new HttpError(400, 'La URL no es válida.');
      if (pathname !== '/api' && !pathname.startsWith('/api/')) {
        serveStatic(request, response, pathname, options.staticDirectory);
        return;
      }
      const route = pathname.slice(4).replace(/\/$/u, '') || '/';
      if (route === '/health') {
        methodOnly(request, response, ['GET']);
        json(response, 200, { status: 'ok', database: 'sqlite' });
        return;
      }
      if (route === '/auth/login') {
        methodOnly(request, response, ['POST']);
        json(response, 200, login(store, validateLogin(await readJson(request)), now()));
        return;
      }
      if (route === '/auth/me') {
        methodOnly(request, response, ['GET']);
        json(response, 200, authenticate(store, request.headers.authorization, now()).user);
        return;
      }
      if (route === '/auth/logout') {
        methodOnly(request, response, ['POST']);
        const session = authenticate(store, request.headers.authorization, now());
        store.deleteSession(session.tokenHash);
        json(response, 204);
        return;
      }
      if (route === '/products') {
        methodOnly(request, response, ['GET', 'POST']);
        const session = authenticate(store, request.headers.authorization, now());
        if (request.method === 'GET') json(response, 200, store.listProducts());
        else {
          const input = validateProduct(await readJson(request));
          const product = store.createProduct(input, session.user.id);
          response.setHeader('Location', `/api/products/${product.id}`);
          json(response, 201, product);
        }
        return;
      }
      const productRoute = /^\/products\/([^/]+)$/u.exec(route);
      if (productRoute) {
        methodOnly(request, response, ['GET', 'PUT', 'DELETE']);
        authenticate(store, request.headers.authorization, now());
        const id = validateId(productRoute[1]);
        if (request.method === 'DELETE') {
          if (!store.deleteProduct(id)) throw new HttpError(404, 'Producto no encontrado.');
          json(response, 204);
        } else {
          const product = request.method === 'PUT'
            ? store.updateProduct(id, validateProduct(await readJson(request)))
            : store.getProduct(id);
          if (!product) throw new HttpError(404, 'Producto no encontrado.');
          json(response, 200, product);
        }
        return;
      }
      throw new HttpError(404, 'Ruta de API no encontrada.');
    } catch (error) {
      if (response.headersSent || response.destroyed) return;
      const failure = error instanceof HttpError ? error : new HttpError(500, 'No fue posible completar la operación.');
      if (failure.status === 401) response.setHeader('WWW-Authenticate', 'Bearer');
      json(response, failure.status, failure.toResponse());
    }
  }

  const server = createServer((request, response) => { void handle(request, response); });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  let closed = false;
  return {
    server,
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      if (server.listening) {
        await new Promise<void>((resolveClose, reject) => {
          server.close(error => error ? reject(error) : resolveClose());
          server.closeAllConnections();
        });
      }
      store.close();
    },
  };
}
