import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const tempRoot = path.join(root, '.tmp');
const php = process.env.PHP_BIN || path.join(process.env.XAMPP_PATH || 'C:/xampp', 'php/php.exe');
let directory;
let server;
let baseUrl;
let serverOutput = '';

before(async () => {
  await mkdir(tempRoot, { recursive: true });
  directory = await mkdtemp(path.join(tempRoot, 'cors-test-'));
  for (const name of ['index.php', 'config.php', 'validation.php', 'http.php', 'auth.php', 'cors.php']) {
    await cp(path.join(root, 'server', name), path.join(directory, name));
  }
  // Si la solicitud supera CORS, esta marca lo confirma sin conectar con ninguna base.
  await writeFile(path.join(directory, 'database.php'), `<?php
declare(strict_types=1);
function database(): PDO {
    header('X-Test-Database-Reached: yes');
    throw new RuntimeException('La prueba no usa MySQL.');
}
`);
  await writeFile(path.join(directory, 'ready.php'), '<?php echo "ready";');
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const { port } = reservation.address();
  await new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
  baseUrl = `http://127.0.0.1:${port}`;
  const env = { ...process.env };
  delete env.CORS_ALLOWED_ORIGINS;
  server = spawn(php, ['-S', `127.0.0.1:${port}`, '-t', directory], { cwd: root, env, windowsHide: true });
  let startupError;
  server.on('error', error => { startupError = error; });
  for (const stream of [server.stdout, server.stderr]) {
    stream.on('data', chunk => { serverOutput = (serverOutput + chunk.toString()).slice(-4000); });
  }
  for (let attempt = 0; attempt < 100; attempt++) {
    if (startupError) throw startupError;
    if (server.exitCode !== null) throw new Error(`PHP terminó al iniciar: ${serverOutput}`);
    try {
      const response = await fetch(`${baseUrl}/ready.php`, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch { /* El proceso aún puede estar iniciando. */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`PHP no inició a tiempo: ${serverOutput}`);
});

after(async () => {
  if (server && server.exitCode === null && server.pid) {
    const stopped = once(server, 'exit');
    server.kill();
    await stopped;
  }
  if (directory) {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tempRoot));
    assert.ok(path.basename(directory).startsWith('cors-test-'));
    await rm(directory, { recursive: true, force: true });
  }
});

const request = (method, headers = {}) => fetch(`${baseUrl}/index.php?route=cart/1`, {
  method, headers, signal: AbortSignal.timeout(3000)
});

function assertNoDatabase(response) {
  assert.equal(response.headers.get('x-test-database-reached'), null);
  assert.match(response.headers.get('vary') || '', /(?:^|,\s*)Origin(?:,|$)/i);
  assert.equal(response.headers.get('access-control-allow-credentials'), null);
}

test('Android e iOS reciben preflight 204 con Bearer y JSON antes de MySQL/autenticación', async () => {
  for (const origin of ['https://localhost', 'capacitor://localhost']) {
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
      const response = await request('OPTIONS', {
        Origin: origin,
        'Access-Control-Request-Method': method,
        'Access-Control-Request-Headers': 'Authorization, CONTENT-TYPE'
      });
      assert.equal(response.status, 204);
      assert.equal(await response.text(), '');
      assertNoDatabase(response);
      assert.equal(response.headers.get('access-control-allow-origin'), origin);
      assert.equal(response.headers.get('access-control-allow-methods'), 'GET, POST, PUT, DELETE');
      assert.equal(response.headers.get('access-control-allow-headers'), 'Authorization, Content-Type');
      assert.equal(response.headers.get('access-control-max-age'), '600');
    }
  }
});

test('orígenes ajenos, subdominios, null y variantes no exactas se rechazan antes de MySQL', async () => {
  for (const origin of ['https://otro.example', 'https://localhost.evil.example', 'https://localhost:444',
    'https://localhost/', 'https://localhost?query=1', 'https://user@localhost', 'null', '*']) {
    const response = await request('OPTIONS', { Origin: origin, 'Access-Control-Request-Method': 'POST' });
    assert.equal(response.status, 403, origin);
    assertNoDatabase(response);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.match((await response.json()).message, /origen.*no está autorizado/i);
  }
});

test('los servidores Angular de npm dev y npm start pasan por el proxy con Origin original', async () => {
  for (const origin of ['http://localhost:8100', 'http://localhost:4200']) {
    // El proxy changeOrigin:true cambia Host al de Apache pero conserva Origin.
    const response = await request('POST', { Origin: origin, 'Content-Type': 'application/json' });
    assert.equal(response.status, 500);
    assert.equal(response.headers.get('x-test-database-reached'), 'yes');
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
  }
  const differentPort = await request('POST', { Origin: 'http://localhost:8101' });
  assert.equal(differentPort.status, 403);
  assertNoDatabase(differentPort);
});

test('una escritura de origen prohibido tampoco ejecuta la API sin preflight', async () => {
  const response = await request('POST', { Origin: 'https://otro.example', 'Content-Type': 'text/plain' });
  assert.equal(response.status, 403);
  assertNoDatabase(response);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('el preflight rechaza métodos fuera del contrato', async () => {
  const response = await request('OPTIONS', {
    Origin: 'https://localhost', 'Access-Control-Request-Method': 'PATCH'
  });
  assert.equal(response.status, 405);
  assertNoDatabase(response);
  assert.equal(response.headers.get('access-control-allow-methods'), null);
  assert.equal(response.headers.get('allow'), 'GET, POST, PUT, DELETE, OPTIONS');
});

test('el preflight rechaza cabeceras no autorizadas y conserva un error JSON legible', async () => {
  const response = await request('OPTIONS', {
    Origin: 'https://localhost', 'Access-Control-Request-Method': 'PUT',
    'Access-Control-Request-Headers': 'authorization, X-Admin-Override'
  });
  assert.equal(response.status, 400);
  assertNoDatabase(response);
  assert.match((await response.json()).message, /Authorization y Content-Type/);
  assert.equal(response.headers.get('access-control-allow-headers'), null);
});

test('las solicitudes web sin Origin alcanzan la API y no agregan permisos CORS', async () => {
  const response = await request('GET');
  assert.equal(response.status, 500); // Error deliberado de la base simulada.
  assert.equal(response.headers.get('x-test-database-reached'), 'yes');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('POST de la web del mismo origen y puerto sigue funcionando', async () => {
  const response = await request('POST', { Origin: baseUrl, 'Content-Type': 'application/json' });
  assert.equal(response.status, 500);
  assert.equal(response.headers.get('x-test-database-reached'), 'yes');
  assert.equal(response.headers.get('access-control-allow-origin'), baseUrl);
  const differentPort = await request('POST', { Origin: 'http://127.0.0.1:1' });
  assert.equal(differentPort.status, 403);
  assertNoDatabase(differentPort);
});

test('el error posterior de API conserva CORS para el cliente móvil', async () => {
  const response = await request('PUT', {
    Origin: 'https://localhost', Authorization: 'Bearer prueba-sin-datos', 'Content-Type': 'application/json'
  });
  assert.equal(response.status, 500);
  assert.equal(response.headers.get('x-test-database-reached'), 'yes');
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://localhost');
  assert.equal(response.headers.get('access-control-allow-credentials'), null);
  assert.equal((await response.json()).message, 'No se pudo completar la operación.');
});

test('OPTIONS sin Origin se resuelve sin MySQL y sin conceder permisos entre orígenes', async () => {
  const response = await request('OPTIONS');
  assert.equal(response.status, 204);
  assertNoDatabase(response);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('config.local.php permite declarar un origen exacto adicional con puerto', async () => {
  const localConfig = path.join(directory, 'config.local.php');
  await writeFile(localConfig, "<?php return ['cors_allowed_origins' => ['https://movil.example:8443']];");
  try {
    const response = await request('OPTIONS', {
      Origin: 'https://movil.example:8443', 'Access-Control-Request-Method': 'GET'
    });
    assert.equal(response.status, 204);
    assertNoDatabase(response);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://movil.example:8443');
    const wrongPort = await request('OPTIONS', {
      Origin: 'https://movil.example', 'Access-Control-Request-Method': 'GET'
    });
    assert.equal(wrongPort.status, 403);
    assertNoDatabase(wrongPort);
  } finally {
    await rm(localConfig);
  }
});
