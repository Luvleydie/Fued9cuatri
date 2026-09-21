import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

// Ejecuta la aplicación compilada: no sustituye servicios, API ni almacenamiento.
const root = fileURLToPath(new URL('../', import.meta.url));
const recording = process.argv.includes('--record');
const artifactRoot = path.join(root, 'artifacts/persistence');
await mkdir(artifactRoot, { recursive: true });
const runDirectory = await mkdtemp(path.join(artifactRoot, 'run-'));
const databasePath = path.join(runDirectory, 'novacart.sqlite');
const profilePath = path.join(runDirectory, 'browser-profile');
const viewport = { width: 1280, height: 800 };
const probe = createServer();
probe.listen(0, '127.0.0.1');
await once(probe, 'listening');
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const baseURL = `http://127.0.0.1:${port}`;
const originalTitle = 'Café de Oaxaca - Persistencia';
const updatedTitle = 'Café de Oaxaca - Actualizado';
const report = {
  startedAt: new Date().toISOString(), recording, viewport,
  database: 'SQLite en archivo, compartido entre procesos nuevos',
  browserStorage: 'Perfil propio en disco, reutilizado sin inyectar storageState',
  checks: [], sessions: [], segments: [],
};
let apiProcess;
let context;
let page;
let apiExit;
let serverLog = '';
let productId;
const runtimeErrors = [];
const pause = async (milliseconds = 1600) => {
  if (recording) await page.waitForTimeout(milliseconds);
};
const check = (name) => {
  report.checks.push({ name, passed: true });
  console.log(`PASS ${name}`);
};

async function startApi() {
  apiProcess = spawn(process.execPath, [path.join(root, 'dist/server/server/index.js')], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DB_PATH: databasePath, PORT: String(port) },
  });
  apiExit = once(apiProcess, 'exit');
  let startupError;
  apiProcess.on('error', error => { startupError = error; });
  apiProcess.stdout.on('data', data => { serverLog += data.toString(); });
  apiProcess.stderr.on('data', data => { serverLog += data.toString(); });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (startupError) throw startupError;
    if (apiProcess.exitCode !== null) throw new Error('La API terminó antes de estar disponible.');
    try {
      const response = await fetch(`${baseURL}/api/health`, { signal: AbortSignal.timeout(500) });
      if (response.ok && (await response.json()).database === 'sqlite') return;
    } catch { /* El proceso aún puede estar iniciando. */ }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('La API no estuvo disponible en 15 segundos.');
}

async function openSession(number, title, description) {
  await startApi();
  const options = {
    headless: true, viewport, locale: 'es-MX',
    ...(recording ? { recordVideo: { dir: path.join(runDirectory, 'raw-video'), size: viewport } } : {}),
  };
  try {
    context = await chromium.launchPersistentContext(profilePath, {
      ...options, ...(process.env.CHROME_CHANNEL === '' ? {} : { channel: process.env.CHROME_CHANNEL ?? 'chrome' }),
    });
  } catch (error) {
    if (process.env.CHROME_CHANNEL !== undefined) throw error;
    context = await chromium.launchPersistentContext(profilePath, options);
  }
  page = context.pages()[0] ?? await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => runtimeErrors.push(error.message));
  report.sessions.push({ number, serverPid: apiProcess.pid, openedAt: new Date().toISOString() });
  report.segments.push({ number, title, description });
  console.log(`Sesión ${number}: navegador nuevo y servidor PID ${apiProcess.pid}.`);
}

async function closeSession() {
  const session = report.sessions.at(-1);
  if (context) {
    const video = page.video();
    const engine = context.browser();
    await context.close();
    assert.equal(engine.isConnected(), false, 'El proceso de navegador debe desconectarse.');
    context = undefined;
    if (recording && video) report.segments.at(-1).path = await video.path();
    if (session) session.browserClosedAt = new Date().toISOString();
  }
  if (apiProcess) {
    const closingProcess = apiProcess;
    if (closingProcess.exitCode === null && closingProcess.signalCode === null) closingProcess.kill('SIGTERM');
    const [exitCode, signal] = await apiExit;
    assert(closingProcess.exitCode !== null || closingProcess.signalCode !== null, 'El servidor debe terminar.');
    if (session) {
      session.serverClosedAt = new Date().toISOString();
      session.exitCode = exitCode;
      session.signal = signal;
    }
    apiProcess = undefined;
  }
  if (session) check(`Sesión ${session.number}: navegador cerrado y proceso servidor terminado`);
}

async function go(route) {
  await page.goto(`${baseURL}${route}`, { waitUntil: 'domcontentloaded' });
}

async function inventory() {
  await go('/inventory');
  await expect(page).toHaveURL(/\/inventory$/);
  await expect(page.locator('.inventory-product').first()).toBeVisible();
  await page.locator('.inventory-list:visible ion-searchbar input').fill('Café de Oaxaca');
}

const row = title => page.locator('.inventory-product').filter({ has: page.getByRole('link', { name: title, exact: true }) });
const cartRow = () => page.locator(`.cart-item:visible[data-product-id="${productId}"]`);

function verifyDisk(expected) {
  // Sólo después de terminar la API: una conexión nueva lee el archivo real.
  const disk = new DatabaseSync(databasePath, { readOnly: true });
  try {
    assert.equal(disk.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    const record = disk.prepare('SELECT id, title, price_cents, stock FROM products WHERE id = ?').get(productId);
    if (expected) assert.deepEqual({ ...record }, { id: productId, ...expected });
    else assert.equal(record, undefined);
    check(expected ? `SQLite sin servidor: ${expected.title}, ${expected.price_cents} centavos, stock ${expected.stock}` : 'SQLite sin servidor: producto eliminado e integridad correcta');
  } finally { disk.close(); }
}

try {
  await openSession(1, '01 / Alta y guardado', 'Crear un producto y agregar dos unidades al carrito.');
  await go('/login');
  await page.getByRole('button', { name: 'Usar cuenta de demostración' }).click();
  await pause(1000);
  await page.getByRole('button', { name: /^Ingresar/ }).click();
  await expect(page).toHaveURL(/\/home$/);
  await go('/inventory');
  await expect(page.locator('.inventory-product').first()).toBeVisible();
  await expect(page.locator('.inventory-layout')).toHaveAttribute('aria-busy', 'false');
  await pause(900);
  await page.getByRole('button', { name: 'Nuevo producto', exact: true }).click();
  for (const [id, value] of [
    ['title', originalTitle], ['description', 'Producto de la demostración: debe permanecer después de cerrar la aplicación.'],
    ['category', 'café'], ['price', '129.90'], ['stock', '8'], ['brand', 'NovaCart'],
  ]) {
    await page.locator(`#product-${id}`).fill(value);
    await pause(250);
  }
  await pause(1200);
  const creation = page.waitForResponse(response => response.url().endsWith('/api/products') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Crear producto', exact: true }).click();
  const created = await creation;
  assert.equal(created.status(), 201);
  productId = (await created.json()).id;
  await expect(page.getByRole('status')).toContainText('Producto creado correctamente.');
  await page.locator('.inventory-list:visible ion-searchbar input').fill('Café de Oaxaca');
  await expect(row(originalTitle)).toContainText('$129.90');
  await expect(row(originalTitle)).toContainText('8 en existencia');
  check('Alta y consulta del producto mediante la interfaz y respuesta HTTP 201');
  await pause(2300);
  await page.getByRole('link', { name: originalTitle, exact: true }).click();
  await page.getByRole('button', { name: 'Agregar al carrito', exact: true }).click();
  await page.getByRole('button', { name: 'Agregar al carrito', exact: true }).click();
  await page.getByRole('navigation').getByRole('link', { name: /Carrito/ }).click();
  await expect(cartRow().getByTestId('quantity')).toHaveText('2');
  await expect(page.getByTestId('cart-total')).toContainText('259.80');
  await pause(2600);
  await closeSession();
  verifyDisk({ title: originalTitle, price_cents: 12990, stock: 8 });

  await openSession(2, '02 / Reabrir y modificar', 'El producto y las dos unidades se restauran desde el disco.');
  await inventory();
  await expect(row(originalTitle)).toContainText('$129.90');
  await expect(row(originalTitle)).toContainText('8 en existencia');
  assert.equal(await row(originalTitle).getByRole('link').getAttribute('href'), `/product/${productId}`);
  check('Primera reapertura: mismo producto, precio y stock; sesión restaurada');
  await pause(2600);
  await page.getByRole('navigation').getByRole('link', { name: /Carrito/ }).click();
  await expect(cartRow().getByTestId('quantity')).toHaveText('2');
  check('Primera reapertura: carrito con dos unidades, sin inyección de almacenamiento');
  await pause(1800);
  await page.getByRole('button', { name: `Aumentar cantidad de ${originalTitle}`, exact: true }).click();
  await expect(cartRow().getByTestId('quantity')).toHaveText('3');
  await pause(1600);
  await inventory();
  await page.getByRole('button', { name: `Editar ${originalTitle}`, exact: true }).click();
  await page.locator('#product-title').fill(updatedTitle);
  await page.locator('#product-price').fill('149.50');
  await page.locator('#product-stock').fill('11');
  await pause(1800);
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Cambios guardados correctamente.');
  await page.locator('.inventory-list:visible ion-searchbar input').fill('Café de Oaxaca');
  await expect(row(updatedTitle)).toContainText('$149.50');
  await expect(row(updatedTitle)).toContainText('11 en existencia');
  check('Modificación: nuevo nombre, precio 149.50, stock 11 y carrito con tres unidades');
  await pause(2300);
  await closeSession();
  verifyDisk({ title: updatedTitle, price_cents: 14950, stock: 11 });

  await openSession(3, '03 / Reabrir y eliminar', 'Los cambios permanecen. Eliminar el producto y su línea del carrito.');
  await inventory();
  await expect(row(updatedTitle)).toContainText('$149.50');
  await expect(row(updatedTitle)).toContainText('11 en existencia');
  check('Segunda reapertura: edición persistida en el producto original');
  await pause(2600);
  await page.getByRole('navigation').getByRole('link', { name: /Carrito/ }).click();
  await expect(cartRow().getByTestId('quantity')).toHaveText('3');
  await expect(page.getByTestId('cart-total')).toContainText('389.70');
  check('Segunda reapertura: cantidad tres conservada en la copia local del carrito');
  await pause(2100);
  await page.getByRole('button', { name: `Eliminar ${originalTitle}`, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tu próxima compra empieza aquí' })).toBeVisible();
  await inventory();
  await page.getByRole('button', { name: `Eliminar ${updatedTitle}`, exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await pause(1600);
  const removal = page.waitForResponse(response => response.url().endsWith(`/api/products/${productId}`) && response.request().method() === 'DELETE');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar', exact: true }).click();
  assert.equal((await removal).status(), 204);
  await expect(page.getByRole('status')).toContainText('Producto eliminado correctamente.');
  await expect(page.getByRole('heading', { name: 'Sin coincidencias', exact: true })).toBeVisible();
  check('Eliminación confirmada en pantalla y respuesta HTTP 204');
  await pause(2400);
  await closeSession();
  verifyDisk(null);

  await openSession(4, '04 / Reabrir y comprobar', 'El producto sigue eliminado y el carrito permanece vacío.');
  await inventory();
  await expect(page.getByRole('heading', { name: 'Sin coincidencias', exact: true })).toBeVisible();
  await expect(row(updatedTitle)).toHaveCount(0);
  await expect(row(originalTitle)).toHaveCount(0);
  check('Tercera reapertura: el producto eliminado no reaparece en el inventario');
  await pause(2600);
  await go(`/product/${productId}`);
  await expect(page.getByRole('heading', { name: 'Producto no encontrado', exact: true })).toBeVisible();
  check('Tercera reapertura: consultar el ID eliminado muestra producto no encontrado');
  await pause(2200);
  await page.getByRole('navigation').getByRole('link', { name: /Carrito/ }).click();
  await expect(page.getByRole('heading', { name: 'Tu próxima compra empieza aquí' })).toBeVisible();
  await expect(page.locator('.cart-item:visible')).toHaveCount(0);
  check('Tercera reapertura: borrado del carrito persistido');
  await pause(2600);
  await closeSession();
  assert.deepEqual(runtimeErrors, [], 'No debe haber errores JavaScript de la aplicación.');
  check('Sin errores JavaScript durante las cuatro sesiones');
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.error = error.message;
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(runDirectory, 'failure.png') }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  if (context || apiProcess) await closeSession().catch(error => {
    report.passed = false;
    report.cleanupError = error.message;
    process.exitCode = 1;
  });
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(runDirectory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(path.join(runDirectory, 'server.log'), serverLog);
  if (report.passed && recording) {
    await writeFile(path.join(artifactRoot, 'latest-recording.json'), JSON.stringify({ directory: runDirectory }, null, 2) + '\n');
  }
  console.log(`Persistencia: ${report.passed ? 'CORRECTA' : 'FALLÓ'}. Informe: ${path.relative(root, runDirectory)}/report.json`);
}
