import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mobileApiUrl, mobileBuildOptions, EMULATOR_API_URL } from './mobile-config.mjs';

test('API HTTPS remota, prefijos y barra final se conservan correctamente', () => {
  assert.equal(mobileApiUrl('https://api.example.test/novacart/api/'), 'https://api.example.test/novacart/api');
  assert.equal(mobileApiUrl('https://192.168.1.8:8443/api'), 'https://192.168.1.8:8443/api');
});

test('localhost y direcciones relativas no se empaquetan por accidente', () => {
  for (const url of ['api', '/api', 'http://localhost/api', 'https://127.0.0.1/api', 'https://[::1]/api', 'http://0.0.0.0/api', 'http://127.1/api', 'https://localhost./api', 'https://app.localhost./api', 'https://[::ffff:127.0.0.1]/api']) {
    assert.throws(() => mobileApiUrl(url, true));
  }
});

test('HTTP necesita aprobación explícita de desarrollo y una IPv4 privada', () => {
  for (const host of ['10.0.2.2', '192.168.1.55', '172.16.0.1', '172.31.255.254']) {
    assert.throws(() => mobileApiUrl('http://' + host + '/api'));
    assert.equal(mobileApiUrl('http://' + host + '/api', true), 'http://' + host + '/api');
  }
  for (const host of ['example.test', '8.8.8.8', '172.15.0.1', '172.32.0.1', '192.169.1.2']) {
    assert.throws(() => mobileApiUrl('http://' + host + '/api', true));
  }
});

test('rechaza credenciales, protocolos alternativos, query y fragmentos', () => {
  for (const url of ['https://user:password@example.test/api', 'ftp://example.test/api', 'https://example.test/api?key=abc', 'https://example.test/api#login', 'https://example.test/api?', 'https://example.test/api#', '']) {
    assert.throws(() => mobileApiUrl(url));
  }
});

test('perfil emulador reproducible y variables por compilación', () => {
  assert.deepEqual(mobileBuildOptions(['--emulator', '--apk'], {}), { apiUrl: EMULATOR_API_URL, apk: true });
  assert.deepEqual(mobileBuildOptions([], { NOVACART_API_URL: 'https://example.test/api' }), { apiUrl: 'https://example.test/api', apk: false });
  assert.equal(mobileBuildOptions(['--api-url', 'http://192.168.1.55/api', '--allow-local-http'], {}).apiUrl, 'http://192.168.1.55/api');
  assert.throws(() => mobileBuildOptions(['--emulator', '--api-url', 'https://example.test/api'], {}));
  assert.throws(() => mobileBuildOptions(['--api-url'], {}));
  assert.throws(() => mobileBuildOptions(['--release'], {}));
  assert.throws(() => mobileBuildOptions([], {}));
});
