import { mkdir, writeFile } from 'node:fs/promises';
import { assert, expect, baseURL, tokenKey, launchBrowser, makePage, navigate, loginReal, assertNoOverflow } from './browser-helpers.mjs';

const reportPath = 'docs/evidencia/conexion-verificacion.json';
const screenshotDirectory = 'docs/screenshots-conexion';
const cachePrefix = 'novacart.data.v1.';
const results = [];
const browser = await launchBrowser();
// Durante las transiciones Ionic mantiene dos páginas visibles unos instantes.
// La URL identifica la pantalla actual sin depender del final de la animación.
const active = page => {
  const route = new URL(page.url()).pathname.replace(/\/$/, '').split('/').pop();
  assert.ok(['home', 'cart', 'login', 'register'].includes(route), 'Pantalla conocida para la prueba.');
  return page.locator(`app-${route}:not(.ion-page-hidden) main`);
};
const notice = page => active(page).getByTestId('connection-status');
const refresh = page => active(page).getByRole('button', { name: 'Actualizar', exact: true });
const users = page => active(page).locator('.user-row');

await mkdir('docs/evidencia', { recursive: true });
await mkdir(screenshotDirectory, { recursive: true });

async function readyForOffline(page) {
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), undefined, { timeout: 45000 });
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return { scope: registration.scope, state: registration.active?.state };
  });
}

async function capture(page, name) {
  const path = `${screenshotDirectory}/${name}.png`;
  await expect(page.locator('app-login:not(.ion-page-hidden), app-register:not(.ion-page-hidden), app-home:not(.ion-page-hidden), app-cart:not(.ion-page-hidden)')).toHaveCount(1);
  const viewport = page.viewportSize();
  const fullHeight = await active(page).evaluate(main => Math.ceil(main.scrollHeight) + 100);
  try {
    // Ionic usa scroll interno: ampliar solo la altura permite ver toda la evidencia.
    await page.setViewportSize({ width: viewport.width, height: Math.max(viewport.height, fullHeight) });
    await active(page).evaluate(async main => { await main.closest('ion-content').scrollToTop(0); });
    await page.screenshot({
      path,
      fullPage: true,
      animations: 'disabled',
      maskColor: '#d7d2e4',
      mask: [active(page).locator('input[type="password"]'), active(page).getByText(/^Demo:/)],
    });
  } finally {
    await page.setViewportSize(viewport);
  }
  return path;
}

async function scenario(name, callback) {
  const { context, page, errors } = await makePage(browser);
  const startedAt = Date.now();
  try {
    const evidence = await callback(page, context);
    assert.deepEqual(errors, [], 'No debe haber excepciones sin tratar en el navegador.');
    results.push({ name, passed: true, durationMs: Date.now() - startedAt, ...evidence });
    console.log(`PASS ${name}`);
  } catch (error) {
    const screenshot = await capture(page, `fallo-${results.length + 1}`).catch(() => undefined);
    results.push({ name, passed: false, durationMs: Date.now() - startedAt, error: error.message, browserErrors: errors, screenshot });
    console.error(`FAIL ${name}: ${error.message}`);
  } finally {
    await context.setOffline(false).catch(() => undefined);
    // Cerrar únicamente la sesión demo creada en este contexto de prueba.
    const token = await page.evaluate(key => sessionStorage.getItem(key), tokenKey).catch(() => null);
    if (token) await context.request.post(new URL('api/auth/logout', baseURL).href, { headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined);
    await context.close();
  }
}

try {
  await scenario('Desconexión real, lectura temporal, recarga y recuperación', async (page, context) => {
    await loginReal(page);
    const serviceWorker = await readyForOffline(page);
    const userCount = await users(page).count();
    await page.getByRole('link', { name: 'Carrito', exact: true }).click();
    await expect(active(page).getByTestId('products-cache-status')).toContainText('Última actualización');
    await expect(active(page).getByTestId('cart-cache-status')).toContainText('Última actualización');
    const total = await active(page).getByTestId('cart-total').innerText();
    const productCount = await active(page).getByRole('button', { name: /^Agregar / }).count();
    assert.ok(productCount > 0, 'La prueba requiere productos reales cargados en línea.');
    await expect(active(page).locator('.price-bar')).toHaveCount(productCount);
    await expect(active(page).locator('.stock-bar')).toHaveCount(productCount);

    await context.setOffline(true);
    await expect(notice(page)).toContainText('Sin conexión');
    await refresh(page).click();
    await expect(active(page).getByTestId('products-cache-status')).toContainText('Mostrando copia temporal');
    await expect(active(page).getByTestId('cart-cache-status')).toContainText('Mostrando copia temporal');
    for (const button of await active(page).getByRole('button', { name: /^(Agregar |Aumentar |Disminuir |Quitar )/ }).all()) await expect(button).toBeDisabled();
    const screenshot = await capture(page, '01-carrito-sin-conexion');
    await page.setViewportSize({ width: 390, height: 1000 });
    await assertNoOverflow(page, 390);
    const mobileScreenshot = await capture(page, '01-carrito-sin-conexion-movil');
    await page.setViewportSize({ width: 1440, height: 1000 });

    await page.reload();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(active(page).getByTestId('cart-total')).toHaveText(total);
    await expect(notice(page)).toContainText('Sin conexión');
    await expect(active(page).getByRole('button', { name: /^Agregar / })).toHaveCount(productCount);
    await expect(active(page).getByTestId('price-chart')).toBeVisible();
    await expect(active(page).getByTestId('stock-chart')).toBeVisible();
    await expect(active(page).locator('.price-bar')).toHaveCount(productCount);
    await expect(active(page).locator('.stock-bar')).toHaveCount(productCount);
    assert.equal(await active(page).locator('app-cart-charts').evaluate(node => /NaN|Infinity/.test(node.innerHTML)), false);
    await page.getByRole('link', { name: 'Usuarios', exact: true }).click();
    await expect(users(page)).toHaveCount(userCount);
    await expect(active(page).getByTestId('users-cache-status')).toContainText('Mostrando copia temporal');
    await expect(active(page).locator('#user-username')).toBeDisabled();
    await capture(page, '02-usuarios-recarga-sin-conexion');

    await context.setOffline(false);
    await expect(notice(page)).toContainText('Red disponible');
    await refresh(page).click();
    await expect(active(page).getByTestId('users-cache-status')).toContainText('Última actualización');
    await expect(active(page).locator('#user-username')).toBeEnabled();
    const publicCache = await page.evaluate(async () => {
      const urls = [];
      for (const key of await caches.keys()) {
        for (const request of await (await caches.open(key)).keys()) urls.push(request.url);
      }
      return { assetCount: urls.length, containsApi: urls.some(url => new URL(url).pathname.includes('/api/')) };
    });
    assert.ok(publicCache.assetCount > 0);
    assert.equal(publicCache.containsApi, false, 'El service worker no debe almacenar respuestas privadas de la API.');
    return { screenshot, mobileScreenshot, serviceWorker, userCount, productCount, publicCache, offlineReloadPassed: true, d3ChartsOfflinePassed: true, recovered: true };
  });

  await scenario('Servidor 503 con copia válida y actualización posterior', async page => {
    await loginReal(page);
    const previousUsers = await users(page).count();
    await page.route('**/api/users', route => route.fulfill({ status: 503, json: { message: 'SQLSTATE[HY000]: detalle interno de prueba' } }));
    await refresh(page).click();
    await expect(active(page).getByTestId('users-cache-status')).toContainText('Mostrando copia temporal');
    await expect(notice(page)).toContainText('no se pudo contactar con el servicio');
    await expect(users(page)).toHaveCount(previousUsers);
    await expect(active(page).locator('#user-username')).toBeDisabled();
    await expect(active(page)).not.toContainText('SQLSTATE');
    const screenshot = await capture(page, '03-servicio-no-disponible');
    await page.unroute('**/api/users');
    await refresh(page).click();
    await expect(active(page).getByTestId('users-cache-status')).toContainText('Última actualización');
    await expect(active(page).locator('#user-username')).toBeEnabled();
    return { screenshot, cachedUsers: previousUsers, technicalDetailsHidden: true };
  });

  await scenario('Sin conexión y sin copia previa del carrito', async (page, context) => {
    await loginReal(page);
    await readyForOffline(page);
    await context.setOffline(true);
    await expect(notice(page)).toContainText('Sin conexión');
    await page.getByRole('link', { name: 'Carrito', exact: true }).click();
    await expect(active(page).getByRole('alert')).toContainText('No hay una copia temporal válida');
    await expect(active(page).getByRole('button', { name: /^Agregar / })).toHaveCount(0);
    await expect(active(page).getByTestId('cart-total')).toHaveCount(0);
    await expect(active(page).getByText('Tu carrito está vacío.', { exact: true })).toHaveCount(0);
    const screenshot = await capture(page, '04-sin-copia-disponible');
    return { screenshot, missingDataNotShownAsEmptyCart: true };
  });

  await scenario('Sesión 401: elimina copia y exige iniciar sesión', async page => {
    await loginReal(page);
    // Esperar también ionViewWillEnter: el 401 debe afectar el refresco explícito.
    await expect(page.locator('app-login:not(.ion-page-hidden)')).toHaveCount(0);
    await expect(refresh(page)).toBeEnabled();
    await page.route('**/api/users', route => route.fulfill({ status: 401, json: { message: 'Sesión vencida' } }));
    await refresh(page).click();
    await expect(page).toHaveURL(/\/login\?expired=1$/);
    await expect(active(page).getByRole('alert')).toContainText('Tu sesión venció');
    const stored = await page.evaluate(({ tokenKey, cachePrefix }) => ({
      tokenPresent: sessionStorage.getItem(tokenKey) !== null,
      cacheCount: Object.keys(sessionStorage).filter(key => key.startsWith(cachePrefix)).length,
    }), { tokenKey, cachePrefix });
    assert.deepEqual(stored, { tokenPresent: false, cacheCount: 0 });
    return { ...stored, screenshot: await capture(page, '05-sesion-vencida') };
  });

  await scenario('Cuota de almacenamiento: respaldo en memoria y aviso al recargar', async (page, context) => {
    await page.addInitScript(prefix => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (String(key).startsWith(prefix)) throw new DOMException('Cuota simulada para datos temporales', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    }, cachePrefix);
    await loginReal(page);
    await readyForOffline(page);
    const userCount = await users(page).count();
    await expect(active(page).getByTestId('users-cache-status')).toContainText('solo en memoria');
    await context.setOffline(true);
    await refresh(page).click();
    await expect(users(page)).toHaveCount(userCount);
    await expect(active(page).getByTestId('users-cache-status')).toContainText('solo en memoria');
    const screenshot = await capture(page, '06-almacenamiento-en-memoria');
    await page.reload();
    await expect(active(page).getByRole('alert')).toContainText('No hay una copia temporal válida');
    await expect(users(page)).toHaveCount(0);
    return { screenshot, memoryFallbackPassed: true, volatileDataLossExplained: true };
  });

  await scenario('Escritura 503: un solo envío y formulario conservado', async page => {
    await loginReal(page);
    const name = `offline_test_${Date.now()}`;
    await active(page).locator('#user-username').fill(name);
    await active(page).locator('#user-firstName').fill('Prueba');
    await active(page).locator('#user-lastName').fill('Conexión');
    await active(page).locator('#user-email').fill(`${name}@example.test`);
    await active(page).locator('#user-password').fill('Offline-test-123');
    await active(page).locator('#user-confirm-password').fill('Offline-test-123');
    let writes = 0;
    await page.route('**/api/users', route => {
      if (route.request().method() !== 'POST') return route.continue();
      writes++;
      return route.fulfill({ status: 503, json: { message: 'SQLSTATE: fallo simulado' } });
    });
    await active(page).getByRole('button', { name: 'Crear usuario', exact: true }).click();
    await expect(active(page).getByRole('alert')).toContainText('No pudimos confirmar');
    await expect(active(page).getByRole('alert')).toContainText('actualiza los datos antes de volver a intentarlo');
    await expect(active(page).locator('#user-username')).toHaveValue(name);
    await expect(active(page).locator('#user-password')).toHaveValue('Offline-test-123');
    await expect(active(page).getByRole('button', { name: 'Crear usuario', exact: true })).toBeDisabled();
    await expect(users(page).filter({ has: page.getByRole('heading', { name, exact: true }) })).toHaveCount(0);
    const screenshot = await capture(page, '07-escritura-no-confirmada');
    await refresh(page).click();
    await expect(active(page).locator('#user-username')).toBeEnabled();
    await expect(active(page).locator('#user-username')).toHaveValue(name);
    assert.equal(writes, 1, 'No se deben reintentar automáticamente las escrituras.');
    return { screenshot, writes, formPreserved: true, noRecordCreated: true };
  });

  await scenario('Inicio de sesión y registro deshabilitados sin conexión', async (page, context) => {
    await navigate(page, 'login');
    await readyForOffline(page);
    await context.setOffline(true);
    await expect(notice(page)).toContainText('Sin conexión');
    await active(page).getByRole('button', { name: 'Usar cuenta demo', exact: true }).click();
    await expect(active(page).getByRole('button', { name: 'Ingresar', exact: true })).toBeDisabled();
    await page.getByRole('link', { name: 'Registrarse', exact: true }).click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(notice(page)).toContainText('Sin conexión');
    await expect(active(page).getByRole('button', { name: 'Crear cuenta', exact: true })).toBeDisabled();
    return { screenshot: await capture(page, '08-registro-sin-conexion'), offlineNavigationPassed: true };
  });
} finally {
  await browser.close();
  await writeFile(reportPath, JSON.stringify({ at: new Date().toISOString(), baseURL, offlineSimulation: 'Playwright BrowserContext.setOffline(true)', results }, null, 2));
}

if (results.some(result => !result.passed)) process.exitCode = 1;
console.log(`${results.filter(result => result.passed).length}/${results.length} escenarios correctos; evidencia: ${reportPath}`);
