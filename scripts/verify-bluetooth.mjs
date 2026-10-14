// Browser integration with the real Capacitor BLE web adapter and simulated hardware.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { assert, expect, launchBrowser, assertNoOverflow } from './browser-helpers.mjs';

const webRoot = path.resolve(process.env.WEB_DIR || 'www');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const candidate = path.resolve(webRoot, '.' + pathname);
    if (!candidate.startsWith(webRoot + path.sep)) throw new Error('Invalid path');
    let file;
    let type = path.extname(candidate);
    try { file = await readFile(candidate); }
    catch { file = await readFile(path.join(webRoot, 'index.html')); type = '.html'; }
    res.writeHead(200, { 'Content-Type': mime[type] || 'application/octet-stream' });
    res.end(file);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await launchBrowser();
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-MX', serviceWorkers: 'block' });
  await context.addInitScript(() => {
    sessionStorage.setItem('novacart.accessToken', 'a'.repeat(64));
    sessionStorage.setItem('novacart.expiresAt', String(Math.floor(Date.now() / 1000) + 3600));
    sessionStorage.setItem('novacart.user', JSON.stringify({ id: 1, username: 'prueba.ble', firstName: 'Prueba' }));
    const state = window.__ble = { writes: [], requests: [], connections: 0, disconnects: 0 };
    const characteristic = {
      uuid: '7d2ea28b-f7bd-485a-bd9d-92ad6ecfe93e', properties: { write: true },
      getDescriptors: async () => [],
      writeValueWithResponse: async value => { state.writes.push(Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))); },
    };
    const service = {
      uuid: '7d2ea28a-f7bd-485a-bd9d-92ad6ecfe93e',
      getCharacteristics: async () => [characteristic],
      getCharacteristic: async () => characteristic,
    };
    const device = new EventTarget();
    device.id = 'test-ble-phone';
    device.name = 'Teléfono de prueba';
    device.gatt = {
      connect: async () => { state.connections++; return device.gatt; },
      disconnect: () => { state.disconnects++; device.dispatchEvent(new Event('gattserverdisconnected')); },
      getPrimaryServices: async () => [service],
      getPrimaryService: async () => service,
    };
    Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: {
      getAvailability: async () => true,
      requestDevice: async options => { state.requests.push(options); return device; },
    } });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => route.fulfill({ headers: { 'Access-Control-Allow-Origin': '*' }, json: { users: [{ id: 1, username: 'prueba.ble', firstName: 'Prueba' }] } }));
  await page.goto(base + '/home');
  const panel = page.locator('app-file-metadata-transfer');
  await expect(panel.getByRole('heading', { name: 'Metadata de un archivo por Bluetooth' })).toBeVisible();
  const send = panel.getByRole('button', { name: 'Enviar metadata', exact: true });
  await expect(send).toBeDisabled();
  const body = 'CONTENIDO PRIVADO QUE NUNCA DEBE TRANSMITIRSE';
  await panel.locator('input[type=file]').setInputFiles({ name: 'Información-á-📄.txt', mimeType: 'text/plain', buffer: Buffer.from(body) });
  await expect(panel.getByTestId('metadata-preview')).toContainText('Información-á-📄.txt');
  await panel.getByRole('button', { name: 'Preparar Bluetooth' }).click();
  await panel.getByRole('button', { name: 'Elegir dispositivo cercano' }).click();
  await expect(panel.locator('.destination')).toContainText('Teléfono de prueba');
  assert.equal(await page.evaluate(() => window.__ble.writes.length), 0, 'Elegir destino no envía');
  await send.click();
  await expect(panel.getByRole('status')).toContainText('recibida por Teléfono de prueba');
  const state = await page.evaluate(() => window.__ble);
  assert.equal(state.connections, 1);
  assert.equal(state.disconnects, 1);
  assert.deepEqual(state.requests[0].filters[0].services, ['7d2ea28a-f7bd-485a-bd9d-92ad6ecfe93e']);
  assert.ok(state.writes.every(frame => frame.length <= 20));
  assert.equal(state.writes[0][0], 1);
  assert.deepEqual(state.writes.at(-1), [3]);
  const json = Buffer.from(state.writes.slice(1, -1).flatMap(frame => frame.slice(1))).toString('utf8');
  const message = JSON.parse(json);
  assert.equal(message.file.name, 'Información-á-📄.txt');
  assert.equal(message.file.size, Buffer.byteLength(body));
  assert.deepEqual(Object.keys(message.file).sort(), ['lastModified', 'name', 'size', 'type']);
  assert.ok(!json.includes(body));
  const declaredLength = Buffer.from(state.writes[0]).readUInt32LE(1);
  assert.equal(declaredLength, Buffer.byteLength(json));

  await panel.locator('#metadata-target-kind').selectOption('external');
  await expect(send).toBeDisabled();
  await panel.locator('#metadata-service').fill('7d2ea28a-f7bd-485a-bd9d-92ad6ecfe93e');
  await panel.locator('#metadata-characteristic').fill('7d2ea28b-f7bd-485a-bd9d-92ad6ecfe93e');
  await panel.getByRole('button', { name: 'Elegir dispositivo cercano' }).click();
  await page.evaluate(() => { window.__ble.writes = []; });
  await send.click();
  await expect(panel.getByRole('status')).toContainText('Comprueba su recepción');
  const external = await page.evaluate(() => window.__ble.writes);
  assert.equal(Buffer.from(external.flat()).toString('utf8'), json + '\n');

  await mkdir('artifacts/bluetooth', { recursive: true });
  for (const width of [1440, 390, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    await assertNoOverflow(page, width);
    await panel.locator('h2').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `artifacts/bluetooth/metadata-${width}.png` });
    await send.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `artifacts/bluetooth/metadata-actions-${width}.png` });
  }
  assert.deepEqual(errors, []);
  console.log('PASS metadata visible; explicit destination; actual plugin web adapter; NovaCart framing; JSON-lines; metadata only; disconnect cleanup; mobile layout 360/390/1440. Hardware simulated.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
