import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { buildOfflineWorker } from './build-offline.mjs';

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'novacart-offline-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const files = {
    'index.html': '<html>Public shell</html>',
    'main-A.js': 'console.log("main")',
    'chunk-cart-A.js': 'console.log("lazy cart")',
    'styles-A.css': 'body{margin:0}',
    'assets/products/1.webp': 'public product image',
    'svg/cart.svg': '<svg/>',
    'api/private.json': '{"token":"secret"}',
    'assets/private.json': '{"token":"secret"}',
    'main-A.js.map': '{}',
  };
  for (const [name, contents] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(directory, name)), { recursive: true });
    await writeFile(path.join(directory, name), contents);
  }
  return { directory, files };
}

async function worker(directory, files, base = '/novacart/', options = {}) {
  const scope = new URL(base, 'https://example.test').href;
  const listeners = new Map();
  const storage = new Map();
  const requests = [];
  let claimed = false;
  let online = true;
  const caches = {
    has: async key => storage.has(key),
    keys: async () => [...storage.keys()],
    delete: async key => storage.delete(key),
    open: async key => {
      if (!storage.has(key)) storage.set(key, new Map());
      const entries = storage.get(key);
      return {
        put: async (url, response) => entries.set(url, response.clone()),
        match: async url => entries.get(url)?.clone(),
      };
    },
  };
  vm.runInNewContext(await readFile(path.join(directory, 'offline-worker.js'), 'utf8'), {
    self: {
      registration: { scope },
      addEventListener: (name, callback) => listeners.set(name, callback),
      clients: { claim: async () => { claimed = true; } },
    },
    caches, URL, Request, Uint8Array, crypto: webcrypto,
    fetch: async request => {
      requests.push(request);
      if (!online) throw new Error('Offline');
      const relative = new URL(request.url).pathname.slice(new URL(scope).pathname.length);
      const body = options.corrupt === relative ? 'Different deployed version' : files[relative];
      return new Response(body ?? 'Not found', { status: body ? 200 : 404 });
    },
  });
  return {
    storage, requests,
    get claimed() { return claimed; },
    offline() { online = false; },
    lifecycle(name) {
      let promise;
      listeners.get(name)({ waitUntil: value => { promise = value; } });
      return promise;
    },
    request(relative, { mode = 'cors', method = 'GET', authorized = false } = {}) {
      let response;
      listeners.get('fetch')({
        request: {
          url: new URL(relative, scope).href, mode, method,
          headers: new Headers(authorized ? { Authorization: 'Bearer private' } : {}),
        },
        respondWith: value => { response = value; },
      });
      return response;
    },
  };
}

test('manifest contains only public build assets and version follows build content', async t => {
  const { directory } = await fixture(t);
  const initial = await buildOfflineWorker(directory);
  const source = await readFile(path.join(directory, 'offline-worker.js'), 'utf8');
  assert.equal(initial.files, 6);
  assert.ok(source.includes('chunk-cart-A.js'));
  assert.ok(!source.includes('private.json'));
  assert.ok(!source.includes('main-A.js.map'));
  assert.deepEqual(await buildOfflineWorker(directory), initial);
  await writeFile(path.join(directory, 'chunk-cart-A.js'), 'console.log("new cart")');
  assert.notEqual((await buildOfflineWorker(directory)).version, initial.version);
});

for (const base of ['/', '/novacart/']) {
  test(`offline shell and lazy chunks work under ${base} without caching API/auth`, async t => {
    const { directory, files } = await fixture(t);
    await buildOfflineWorker(directory);
    const sw = await worker(directory, files, base);
    await sw.lifecycle('install');
    assert.equal(sw.requests.length, 6);
    assert.ok(sw.requests.every(request => request.credentials === 'omit' && request.cache === 'reload'));
    await sw.lifecycle('activate');
    assert.equal(sw.claimed, true);
    sw.offline();

    for (const route of ['', 'index.html', 'home', 'cart/', 'home?filter=public']) {
      assert.equal(await (await sw.request(route, { mode: 'navigate' })).text(), files['index.html']);
    }
    assert.equal(await (await sw.request('chunk-cart-A.js')).text(), files['chunk-cart-A.js']);
    assert.equal(await (await sw.request('assets/products/1.webp')).text(), files['assets/products/1.webp']);
    assert.equal(sw.requests.length, 6, 'all offline reads use their installed build');

    for (const route of ['api/products', 'api/auth/login', 'auth/session', 'assets/private.json', 'https://external.test/home']) {
      assert.equal(sw.request(route), undefined);
      assert.equal(sw.request(route, { mode: 'navigate' }), undefined);
    }
    assert.equal(sw.request('main-A.js', { method: 'POST' }), undefined);
    assert.equal(sw.request('main-A.js', { authorized: true }), undefined);
    assert.equal(sw.request('main-A.js?token=private'), undefined);
    assert.equal(sw.storage.size, 1);
    assert.equal([...sw.storage.values()][0].size, 6);
  });
}

test('failed or mixed deployment never activates an incomplete offline cache', async t => {
  const { directory, files } = await fixture(t);
  await buildOfflineWorker(directory);
  const sw = await worker(directory, files, '/novacart/', { corrupt: 'chunk-cart-A.js' });
  sw.storage.set('another-app', new Map());
  await assert.rejects(sw.lifecycle('install'), /despliegue cambió/);
  assert.deepEqual([...sw.storage.keys()], ['another-app']);
  assert.equal(sw.claimed, false);
});

test('activation removes only outdated caches for this exact application scope', async t => {
  const { directory, files } = await fixture(t);
  await buildOfflineWorker(directory);
  const sw = await worker(directory, files);
  sw.storage.set('novacart-shell:%2Fnovacart%2F:old', new Map());
  sw.storage.set('novacart-shell:%2F:other-install', new Map());
  sw.storage.set('another-app', new Map());
  await sw.lifecycle('install');
  await sw.lifecycle('activate');
  assert.equal(sw.storage.has('novacart-shell:%2Fnovacart%2F:old'), false);
  assert.equal(sw.storage.has('novacart-shell:%2F:other-install'), true);
  assert.equal(sw.storage.has('another-app'), true);
  assert.equal(sw.storage.size, 3);
});

test('generation requires an existing Angular build', async t => {
  const { directory } = await fixture(t);
  await rm(path.join(directory, 'index.html'));
  await assert.rejects(buildOfflineWorker(directory), /Falta index.html/);
});
