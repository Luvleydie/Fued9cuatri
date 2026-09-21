import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { test, type TestContext } from 'node:test';
import type { ApiError } from '../../src/app/models/api-error.model';
import type { AuthResponse } from '../../src/app/models/auth-response.model';
import type { Product, ProductsResponse } from '../../src/app/models/product.model';
import type { ProductInput } from '../../src/app/models/product-input.model';
import { createApplication } from '../app';

const validProduct: ProductInput = {
  title: 'Café de prueba', description: 'Producto creado por la prueba HTTP.', category: 'alimentos',
  price: 123.45, stock: 7, brand: 'NovaCart', thumbnail: 'assets/products/1.webp',
};

async function fixture(context: TestContext, now?: () => number) {
  const directory = mkdtempSync(join(tmpdir(), 'novacart-api-'));
  const databasePath = join(directory, 'test.sqlite');
  const staticDirectory = join(directory, 'www');
  mkdirSync(staticDirectory);
  writeFileSync(join(staticDirectory, 'index.html'), '<!doctype html><title>NovaCart test</title>');
  writeFileSync(join(staticDirectory, 'main.js'), 'window.novacart = true;');
  let application = createApplication({ databasePath, now, staticDirectory });
  let base = '';
  async function listen(): Promise<void> {
    await new Promise<void>(resolveListening => application.server.listen(0, '127.0.0.1', resolveListening));
    const address = application.server.address();
    assert(address && typeof address !== 'string');
    base = `http://127.0.0.1:${address.port}`;
  }
  context.after(async () => {
    await application.close();
    // La eliminación recursiva se limita al directorio temporal creado por esta prueba.
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert(basename(directory).startsWith('novacart-api-'));
    rmSync(directory, { recursive: true, force: true });
  });
  await listen();
  async function request(path: string, method = 'GET', body?: unknown, token?: string): Promise<Response> {
    return fetch(`${base}${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }
  async function signIn(expiresInMins = 60): Promise<AuthResponse> {
    const response = await request('/api/auth/login', 'POST', { username: 'emilys', password: 'emilyspass', expiresInMins });
    assert.equal(response.status, 200);
    return await response.json() as AuthResponse;
  }
  return {
    databasePath, request, signIn,
    raw: (path: string, init?: RequestInit): Promise<Response> => fetch(`${base}${path}`, init),
    async restart(): Promise<void> {
      await application.close();
      application = createApplication({ databasePath, now, staticDirectory });
      await listen();
    },
  };
}

test('login real, identidad pública y restricciones de autenticación', async context => {
  const app = await fixture(context);
  const health = await app.request('/api/health');
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok', database: 'sqlite' });
  for (const path of ['/api/auth/me', '/api/products', '/api/products/1']) {
    assert.equal((await app.request(path)).status, 401);
  }
  assert.equal((await app.request('/api/products', 'POST', validProduct)).status, 401);
  assert.equal((await app.request('/api/products/1', 'PUT', validProduct)).status, 401);
  assert.equal((await app.request('/api/products/1', 'DELETE')).status, 401);
  assert.equal((await app.request('/api/auth/login', 'POST', { username: 'emilys', password: 'wrong' })).status, 401);
  assert.equal((await app.request('/api/auth/login', 'POST', { username: "' OR 1=1 --", password: 'emilyspass' })).status, 401);
  const auth = await app.signIn();
  assert.equal(auth.username, 'emilys');
  assert.equal(auth.accessToken.split('.').length, 3);
  assert(!('password' in auth));
  assert(!('passwordHash' in auth));
  assert(!('password_hash' in auth));
  assert(!('refreshToken' in auth));
  const me = await app.request('/api/auth/me', 'GET', undefined, auth.accessToken);
  assert.equal(me.status, 200);
  const identity = await me.json() as Record<string, unknown>;
  assert.equal(identity['id'], auth.id);
  assert(!('accessToken' in identity));
});

test('CRUD completo conserva datos y metadatos tras reiniciar SQLite', async context => {
  const app = await fixture(context);
  const { accessToken } = await app.signIn();
  const initial = await (await app.request('/api/products?limit=0', 'GET', undefined, accessToken)).json() as ProductsResponse;
  assert.equal(initial.total, 6);
  assert.equal(initial.products.length, 6);
  const createdResponse = await app.request('/api/products', 'POST', { ...validProduct, id: 1, created_by: -1 }, accessToken);
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json() as Product;
  assert.equal(created.id, 7);
  assert.equal(createdResponse.headers.get('location'), `/api/products/${created.id}`);
  assert.equal(created.price, 123.45);
  assert.deepEqual(created.images, [validProduct.thumbnail]);
  const edited: ProductInput = { ...validProduct, title: "Café ' OR 1=1 --", price: 10.01, stock: 0 };
  const updatedResponse = await app.request(`/api/products/${created.id}`, 'PUT', edited, accessToken);
  assert.equal(updatedResponse.status, 200);
  const updated = await updatedResponse.json() as Product;
  assert.equal(updated.title, edited.title);
  assert.equal(updated.price, 10.01);
  assert.equal(updated.stock, 0);
  const seed = initial.products[0];
  const seedUpdate = await app.request('/api/products/1', 'PUT', {
    ...seed, stock: 25, rating: 0, discountPercentage: 99, images: ['https://invalid.test/injected.png'],
  }, accessToken);
  const preserved = await seedUpdate.json() as Product;
  assert.equal(preserved.rating, seed.rating);
  assert.equal(preserved.discountPercentage, seed.discountPercentage);
  assert.deepEqual(preserved.images, seed.images);
  await app.restart();
  const read = await app.request(`/api/products/${created.id}`, 'GET', undefined, accessToken);
  assert.equal(read.status, 200, 'La sesión firmada y el producto sobreviven al reinicio.');
  assert.equal((await read.json() as Product).title, edited.title);
  assert.equal((await app.request(`/api/products/${created.id}`, 'DELETE', undefined, accessToken)).status, 204);
  assert.equal((await app.request(`/api/products/${created.id}`, 'GET', undefined, accessToken)).status, 404);
  assert.equal((await app.request(`/api/products/${created.id}`, 'DELETE', undefined, accessToken)).status, 404);
});

test('un catálogo vaciado no se vuelve a sembrar al reiniciar', async context => {
  const app = await fixture(context);
  const { accessToken } = await app.signIn();
  for (let id = 1; id <= 6; id += 1) {
    assert.equal((await app.request(`/api/products/${id}`, 'DELETE', undefined, accessToken)).status, 204);
  }
  await app.restart();
  const result = await (await app.request('/api/products', 'GET', undefined, accessToken)).json() as ProductsResponse;
  assert.deepEqual(result, { products: [], total: 0, skip: 0, limit: 0 });
});

test('validación de productos rechaza tipos, límites, precios y URLs inseguras sin escribir', async context => {
  const app = await fixture(context);
  const { accessToken } = await app.signIn();
  const invalid: unknown[] = [
    null, [], 'texto', {},
    { ...validProduct, title: '  ' }, { ...validProduct, title: 'x'.repeat(161) },
    { ...validProduct, description: 'x'.repeat(2001) }, { ...validProduct, category: 'x'.repeat(81) },
    { ...validProduct, brand: 'x'.repeat(121) }, { ...validProduct, price: '12.99' },
    { ...validProduct, price: -1 }, { ...validProduct, price: 1000001 }, { ...validProduct, price: 1.001 },
    { ...validProduct, price: 0.000000001 },
    { ...validProduct, price: null }, { ...validProduct, stock: 0.5 }, { ...validProduct, stock: -1 },
    { ...validProduct, stock: 1000001 }, { ...validProduct, thumbnail: 'javascript:alert(1)' },
    { ...validProduct, thumbnail: 'data:image/svg+xml,a' }, { ...validProduct, thumbnail: 'assets/../server/schema.sql' },
    { ...validProduct, thumbnail: 'https://user:password@example.com/img.png' },
    { ...validProduct, thumbnail: '//example.com/img.png' }, { ...validProduct, thumbnail: 'assets\\products\\1.webp' },
  ];
  for (const body of invalid) {
    const response = await app.request('/api/products', 'POST', body, accessToken);
    assert.equal(response.status, 400, JSON.stringify(body).slice(0, 160));
    const error = await response.json() as ApiError;
    assert.equal(typeof error.message, 'string');
  }
  const result = await (await app.request('/api/products', 'GET', undefined, accessToken)).json() as ProductsResponse;
  assert.equal(result.total, 6);
  const accepted = await app.request('/api/products', 'POST', {
    ...validProduct, title: '   Producto válido   ', price: 0, stock: 0, brand: '', thumbnail: '',
  }, accessToken);
  assert.equal(accepted.status, 201);
  const product = await accepted.json() as Product;
  assert.equal(product.title, 'Producto válido');
  assert.deepEqual(product.images, []);
});

test('login valida el objeto, la contraseña y la duración solicitada', async context => {
  const app = await fixture(context);
  for (const body of [null, [], {}, { username: 42, password: 'secret' },
    { username: 'emilys', password: '' }, { username: 'emilys', password: 'x'.repeat(201) },
    { username: 'emilys', password: 'emilyspass', expiresInMins: 0 },
    { username: 'emilys', password: 'emilyspass', expiresInMins: null },
    { username: 'emilys', password: 'emilyspass', expiresInMins: 1441 },
    { username: 'emilys', password: 'emilyspass', expiresInMins: 1.5 }]) {
    assert.equal((await app.request('/api/auth/login', 'POST', body)).status, 400);
  }
});

test('rechaza tokens falsificados, sesiones vencidas y sesiones revocadas', async context => {
  let now = Date.now();
  const app = await fixture(context, () => now);
  const auth = await app.signIn(1);
  const parts = auth.accessToken.split('.');
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
  claims['exp'] = Math.floor(now / 1000) + 86400;
  const forged = `${parts[0]}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${parts[2]}`;
  assert.equal((await app.request('/api/products', 'GET', undefined, forged)).status, 401);
  assert.equal((await app.request('/api/auth/me', 'GET', undefined, 'fake.fake.fake')).status, 401);
  now += 61000;
  assert.equal((await app.request('/api/products', 'GET', undefined, auth.accessToken)).status, 401);
  const next = await app.signIn();
  const logout = await app.request('/api/auth/logout', 'POST', undefined, next.accessToken);
  assert.equal(logout.status, 204);
  assert.equal(await logout.text(), '');
  assert.equal((await app.request('/api/auth/me', 'GET', undefined, next.accessToken)).status, 401);
  await app.restart();
  assert.equal((await app.request('/api/products', 'GET', undefined, next.accessToken)).status, 401);
});

test('maneja JSON incorrecto, tamaño, métodos, IDs y rutas desconocidas', async context => {
  const app = await fixture(context);
  const { accessToken } = await app.signIn();
  const malformed = await app.raw('/api/products', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: '{',
  });
  assert.equal(malformed.status, 400);
  const wrongType = await app.raw('/api/products', {
    method: 'POST', headers: { 'Content-Type': 'text/plain', Authorization: `Bearer ${accessToken}` }, body: '{}',
  });
  assert.equal(wrongType.status, 415);
  const large = await app.request('/api/products', 'POST', { ...validProduct, description: 'x'.repeat(70000) }, accessToken);
  assert.equal(large.status, 413);
  const wrongMethod = await app.request('/api/products/1', 'PATCH', {}, accessToken);
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'GET, PUT, DELETE');
  for (const id of ['0', '-1', '1.5', 'abc', '9007199254740992']) {
    assert.equal((await app.request(`/api/products/${id}`, 'GET', undefined, accessToken)).status, 400);
  }
  assert.equal((await app.request('/api/products/99999', 'GET', undefined, accessToken)).status, 404);
  assert.equal((await app.request('/api/products/99999', 'PUT', validProduct, accessToken)).status, 404);
  const unknown = await app.raw('/api/missing', { headers: { Accept: 'text/html' } });
  assert.equal(unknown.status, 404);
  assert.match(unknown.headers.get('content-type') ?? '', /application\/json/u);
  assert.equal((await app.request('/api/%00')).status, 400);
});

test('la BD usa hashes y claves foráneas, sin guardar credenciales ni tokens en texto plano', async context => {
  const app = await fixture(context);
  const { accessToken, id } = await app.signIn();
  const created = await (await app.request('/api/products', 'POST', validProduct, accessToken)).json() as Product;
  const db = new DatabaseSync(app.databasePath, { enableForeignKeyConstraints: true });
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    assert(user);
    assert.notEqual(user['password_hash'], 'emilyspass');
    assert.equal(String(user['password_hash']).length, 128);
    assert.equal(String(user['password_salt']).length, 32);
    const session = db.prepare('SELECT * FROM sessions').get();
    assert(session);
    assert.notEqual(session['token_hash'], accessToken);
    assert.equal(String(session['token_hash']).length, 64);
    const product = db.prepare('SELECT price_cents, created_by FROM products WHERE id = ?').get(created.id);
    assert.deepEqual({ ...product }, { price_cents: 12345, created_by: id });
    assert.throws(() => db.prepare('UPDATE products SET created_by = ? WHERE id = ?').run(99999, created.id), /FOREIGN KEY/u);
    assert.throws(() => db.prepare('UPDATE products SET stock = -1 WHERE id = ?').run(created.id), /CHECK/u);
    assert.equal(readFileSync(`${app.databasePath}.secret`, 'utf8').length, 64);
  } finally { db.close(); }
});

test('sirve la SPA y archivos públicos sin convertir errores de API o assets en HTML', async context => {
  const app = await fixture(context);
  const home = await app.raw('/', { headers: { Accept: 'text/html' } });
  assert.equal(home.status, 200);
  assert.match(await home.text(), /NovaCart test/u);
  const page = await app.raw('/inventory', { headers: { Accept: 'text/html' } });
  assert.equal(page.status, 200);
  const script = await app.raw('/main.js', { method: 'HEAD' });
  assert.equal(script.status, 200);
  assert.match(script.headers.get('content-type') ?? '', /javascript/u);
  assert.equal(await script.text(), '');
  assert.equal((await app.raw('/missing.webp', { headers: { Accept: 'text/html' } })).status, 404);
  assert.equal((await app.raw('/..%2ftest.sqlite')).status, 404);
  assert.equal((await app.raw('/api/products/missing', { headers: { Accept: 'text/html' } })).status, 401);
});
