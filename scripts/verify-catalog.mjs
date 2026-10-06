import { mkdir, writeFile } from 'node:fs/promises';
import { assert, expect, baseURL, launchBrowser, makePage, navigate, assertNoOverflow } from './browser-helpers.mjs';

// Toda la API se intercepta, incluso login, lecturas y DELETE /cart.
// Estos escenarios no acceden a PHP/MySQL ni eliminan carritos reales.
const reportPath = 'docs/evidencia/catalogo-verificacion.json';
const screenshotDirectory = 'docs/screenshots-catalogo';
const preferencesKey = 'novacart.catalog.preferences.v1';
const products = [
  { id: 31, title: 'Mouse Óptico', price: 125, stock: 5 },
  { id: 32, title: 'Teclado mecánico', price: 50, stock: 3 },
  { id: 33, title: 'Audífonos inalámbricos', price: 50, stock: 0 },
  { id: 34, title: 'Cámara web', price: 250, stock: 2 },
];
const account = { id: 930, username: 'emilys', firstName: 'Emily', lastName: 'Prueba', email: 'catalogo@example.test' };
const initialCart = {
  items: products.slice(0, 2).map((product, index) => ({
    productId: product.id, title: product.title, price: product.price,
    stock: product.stock, quantity: index === 0 ? 2 : 1,
  })),
  total: 300,
};
const results = [];
const browser = await launchBrowser();
const active = page => page.locator('app-cart:not(.ion-page-hidden)');
const clearButton = page => active(page).getByTestId('clear-cart');
const confirmation = page => page.locator('ion-alert.clear-cart-alert');
const titleList = page => active(page).locator('.product-card h3').allTextContents();

await mkdir('docs/evidencia', { recursive: true });
await mkdir(screenshotDirectory, { recursive: true });

async function mockApi(context, { empty = false, clearStatus = 200, deferClear = false } = {}) {
  const state = {
    offline: false,
    calls: { login: 0, products: 0, cartReads: 0, clear: 0, unexpected: [] },
    releaseClear: () => undefined,
    cart: empty ? { items: [], total: 0 } : structuredClone(initialCart),
  };
  await context.route('**/api/**', async route => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname.split('/api/')[1];
    const method = request.method();
    // Las rutas de Playwright pueden responder aun con setOffline(true).
    // Abortarlas aquí garantiza que la recarga use exclusivamente la copia local.
    if (state.offline) return route.abort('internetdisconnected');
    if (method === 'POST' && endpoint === 'auth/login') {
      state.calls.login++;
      return route.fulfill({ json: { ...account, accessToken: 'e'.repeat(64), expiresAt: Math.floor(Date.now() / 1000) + 3600 } });
    }
    if (method === 'POST' && endpoint === 'auth/logout') return route.fulfill({ status: 204 });
    if (method === 'GET' && endpoint === 'users') return route.fulfill({ json: { users: [account] } });
    if (method === 'GET' && endpoint === 'products') {
      state.calls.products++;
      return route.fulfill({ json: { products: empty ? [] : products } });
    }
    if (method === 'GET' && endpoint === 'cart') {
      state.calls.cartReads++;
      return route.fulfill({ json: state.cart });
    }
    if (method === 'DELETE' && endpoint === 'cart') {
      state.calls.clear++;
      if (deferClear) await new Promise(resolve => { state.releaseClear = resolve; });
      if (clearStatus !== 200) return route.fulfill({ status: clearStatus, json: { message: 'SQLSTATE: fallo de vaciado simulado' } });
      state.cart = { items: [], total: 0 };
      return route.fulfill({ json: state.cart });
    }
    state.calls.unexpected.push(`${method} ${endpoint}`);
    return route.abort('blockedbyclient');
  });
  return state;
}

async function openCart(page) {
  await navigate(page, 'login');
  const login = page.locator('app-login:not(.ion-page-hidden)');
  await login.getByRole('button', { name: 'Usar cuenta demo', exact: true }).click();
  await login.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  const home = page.locator('app-home:not(.ion-page-hidden)');
  await expect(home.locator('.user-row')).toHaveCount(1);
  await home.getByRole('link', { name: 'Carrito', exact: true }).click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(active(page).getByTestId('cart-cache-status')).toContainText('Última actualización');
  await expect(page.locator('app-home:not(.ion-page-hidden)')).toHaveCount(0);
}

async function capture(page, name) {
  const path = `${screenshotDirectory}/${name}.png`;
  const viewport = page.viewportSize();
  const main = active(page).locator('main');
  const fullHeight = await main.evaluate(node => Math.ceil(node.scrollHeight) + 160);
  try {
    // ion-content tiene scroll interno; ampliar altura permite capturar el contenido.
    await page.setViewportSize({ width: viewport.width, height: Math.max(viewport.height, fullHeight) });
    await main.evaluate(async node => { await node.closest('ion-content').scrollToTop(0); });
    await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  } finally { await page.setViewportSize(viewport); }
  return path;
}

async function scenario(name, callback, options = {}) {
  const { serviceWorkers = 'block', initScript, ...mockOptions } = options;
  const { context, page, errors } = await makePage(browser, { serviceWorkers });
  if (initScript) await page.addInitScript(initScript, preferencesKey);
  const state = await mockApi(context, mockOptions);
  const startedAt = Date.now();
  try {
    const evidence = await callback(page, context, state);
    assert.deepEqual(errors, [], 'Sin excepciones no tratadas en el navegador.');
    assert.deepEqual(state.calls.unexpected, [], 'Todas las peticiones API previstas e interceptadas.');
    results.push({ name, passed: true, durationMs: Date.now() - startedAt, calls: state.calls, ...evidence });
    console.log(`PASS ${name}`);
  } catch (error) {
    const screenshot = await capture(page, `fallo-${results.length + 1}`).catch(() => undefined);
    results.push({ name, passed: false, durationMs: Date.now() - startedAt, error: error.message, calls: state.calls, browserErrors: errors, screenshot });
    console.error(`FAIL ${name}: ${error.message}`);
  } finally {
    state.releaseClear();
    await context.setOffline(false).catch(() => undefined);
    await context.close();
  }
}

try {
  await scenario('Búsqueda normalizada, orden estable y disponibilidad sin alterar las gráficas', async page => {
    await openCart(page);
    const scope = active(page);
    const originalTitles = products.map(product => product.title);
    assert.deepEqual(await titleList(page), originalTitles);
    await expect(scope.locator('.price-bar')).toHaveCount(4);
    await expect(scope.locator('.stock-bar')).toHaveCount(4);
    const chartProductIds = await scope.locator('.price-bar').evaluateAll(nodes => nodes.map(node => Number(node.getAttribute('data-product-id'))));

    await scope.locator('#product-search').fill('  AUDIFONOS   INALAMBRICOS  ');
    await expect(scope.locator('.product-card')).toHaveCount(1);
    assert.deepEqual(await titleList(page), ['Audífonos inalámbricos']);
    await expect(scope.getByRole('button', { name: 'Agregar Audífonos inalámbricos', exact: true })).toBeDisabled();
    await expect(scope.getByTestId('products-result-count')).toHaveText('1 de 4 productos');
    await scope.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
    await scope.locator('#product-sort').selectOption('price-asc');
    assert.deepEqual(await titleList(page), ['Teclado mecánico', 'Audífonos inalámbricos', 'Mouse Óptico', 'Cámara web']);
    await scope.locator('#product-sort').selectOption('price-desc');
    assert.deepEqual(await titleList(page), ['Cámara web', 'Mouse Óptico', 'Teclado mecánico', 'Audífonos inalámbricos']);
    await scope.locator('#product-sort').selectOption('name');
    assert.deepEqual(await titleList(page), ['Audífonos inalámbricos', 'Cámara web', 'Mouse Óptico', 'Teclado mecánico']);
    await scope.locator('#product-availability').selectOption('available');
    await expect(scope.locator('.product-card')).toHaveCount(3);
    await scope.getByTestId('products-result-count').scrollIntoViewIfNeeded();
    await expect(scope.getByTestId('products-result-count')).toHaveText('3 de 4 productos');
    await expect(scope.locator('.price-bar')).toHaveCount(4);
    assert.deepEqual(await scope.locator('.price-bar').evaluateAll(nodes => nodes.map(node => Number(node.getAttribute('data-product-id')))), chartProductIds);
    const screenshot = await capture(page, '01-catalogo-filtros-1440');
    await page.setViewportSize({ width: 390, height: 1000 });
    await assertNoOverflow(page, 390);
    const mobileScreenshot = await capture(page, '01-catalogo-filtros-390');
    await scope.locator('#product-availability').selectOption('unavailable');
    assert.deepEqual(await titleList(page), ['Audífonos inalámbricos']);
    await scope.locator('#product-search').fill('no existe');
    await expect(scope.getByRole('heading', { name: 'Sin coincidencias', exact: true })).toBeVisible();
    await expect(scope.getByRole('heading', { name: 'Estamos preparando el catálogo', exact: true })).toHaveCount(0);
    await scope.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
    await expect(scope.locator('#product-sort')).toHaveValue('default');
    await expect(scope.locator('#product-availability')).toHaveValue('all');
    await expect(scope.locator('#product-search')).toHaveValue('');
    assert.deepEqual(await titleList(page), originalTitles, 'Volver al orden original prueba que sort no mutó el catálogo.');
    return { screenshot, mobileScreenshot, priceTieOrder: [32, 33], normalizedAccentSearch: true, analyticsProductCount: 4, originalOrderPreserved: true };
  });

  await scenario('Las preferencias se conservan al recargar y excluyen búsqueda y datos personales', async page => {
    await openCart(page);
    await active(page).locator('#product-sort').selectOption('price-desc');
    await active(page).locator('#product-availability').selectOption('available');
    await active(page).locator('#product-search').fill('mouse');
    const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), preferencesKey);
    assert.deepEqual(stored, { version: 1, sort: 'price-desc', availability: 'available' });
    await page.reload();
    await expect(active(page).getByTestId('cart-cache-status')).toContainText('Última actualización');
    await expect(active(page).locator('#product-sort')).toHaveValue('price-desc');
    await expect(active(page).locator('#product-availability')).toHaveValue('available');
    await expect(active(page).locator('#product-search')).toHaveValue('');
    assert.deepEqual(await titleList(page), ['Cámara web', 'Mouse Óptico', 'Teclado mecánico']);
    return { stored, onlineReloadPassed: true, searchNotPersisted: true, personalDataNotStoredInPreferences: true };
  });

  await scenario('Cancelar no envía DELETE; confirmar vacía cantidades, total y gráfica con un solo envío', async (page, context, state) => {
    await openCart(page);
    await clearButton(page).click();
    await expect(confirmation(page)).toBeVisible();
    await expect(confirmation(page)).toContainText('¿Vaciar el carrito?');
    const confirmationScreenshot = await capture(page, '02-confirmar-vaciado');
    await confirmation(page).getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(confirmation(page)).toBeHidden();
    assert.equal(state.calls.clear, 0);
    await expect(active(page).locator('.cart-item')).toHaveCount(2);
    await clearButton(page).click();
    const confirmButton = confirmation(page).getByRole('button', { name: 'Vaciar', exact: true });
    await expect(confirmButton).toBeVisible();
    // Dos eventos antes de resolver la petición verifican el bloqueo del segundo envío.
    await confirmButton.evaluate(button => { button.click(); button.click(); });
    await expect.poll(() => state.calls.clear).toBe(1);
    await expect(clearButton(page)).toBeDisabled();
    state.releaseClear();
    await expect(confirmation(page)).toBeHidden();
    await expect(active(page).getByText('El carrito se vació.', { exact: true })).toBeVisible();
    await expect(active(page).locator('.cart-item')).toHaveCount(0);
    await expect(active(page).getByTestId('cart-total')).toContainText('0.00');
    await expect(active(page).locator('.cart-slice')).toHaveCount(0);
    await expect(active(page).getByRole('heading', { name: 'Tu carrito está vacío.', exact: true })).toBeVisible();
    await expect(clearButton(page)).toBeDisabled();
    assert.equal(state.calls.clear, 1, 'El doble clic no duplica DELETE /cart.');
    const screenshot = await capture(page, '03-carrito-vaciado');
    return { confirmationScreenshot, screenshot, cancelledWrites: 0, confirmedWrites: 1, duplicateClickBlocked: true, confirmedTotal: 0, donutSlices: 0 };
  }, { deferClear: true });

  await scenario('Un 503 al vaciar conserva datos y borrador, bloquea reintentos y permite actualizar', async (page, context, state) => {
    await openCart(page);
    const scope = active(page);
    await scope.locator('#cart-quantity-31').fill('3');
    const confirmedTotal = await scope.getByTestId('cart-total').innerText();
    const confirmedAmounts = await scope.locator('.cart-slice').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-value')));
    await clearButton(page).click();
    await confirmation(page).getByRole('button', { name: 'Vaciar', exact: true }).click();
    await expect(confirmation(page)).toBeHidden();
    await expect(scope.getByRole('alert')).toContainText('No pudimos confirmar');
    await expect(scope).not.toContainText('SQLSTATE');
    await expect(scope.locator('.cart-item')).toHaveCount(2);
    await expect(scope.locator('#cart-quantity-31')).toHaveValue('3');
    await expect(scope.getByTestId('cart-total')).toHaveText(confirmedTotal);
    assert.deepEqual(await scope.locator('.cart-slice').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-value'))), confirmedAmounts);
    await expect(clearButton(page)).toBeDisabled();
    const screenshot = await capture(page, '04-vaciado-error-datos-conservados');
    await scope.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await expect(clearButton(page)).toBeEnabled();
    await expect(scope.getByTestId('cart-cache-status')).toContainText('Última actualización');
    assert.equal(state.calls.clear, 1, 'Actualizar sólo realiza GET y no reintenta DELETE.');
    return { screenshot, clearWrites: 1, confirmedTotalPreserved: true, chartPreserved: true, draftPreservedUntilRefresh: true, retryRequiresRefresh: true, technicalDetailsHidden: true };
  }, { clearStatus: 503 });

  await scenario('Desconexión real y recarga conservan filtros; lectura y gráficas siguen disponibles', async (page, context, state) => {
    await openCart(page);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), undefined, { timeout: 45000 });
    const serviceWorker = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return { scope: registration.scope, state: registration.active?.state };
    });
    await active(page).locator('#product-sort').selectOption('price-desc');
    await active(page).locator('#product-availability').selectOption('available');
    await active(page).locator('#product-search').fill('mouse');
    state.offline = true;
    await context.setOffline(true);
    await expect(active(page).getByTestId('connection-status')).toContainText('Sin conexión');
    await page.reload();
    await expect(active(page).getByTestId('products-cache-status')).toContainText('Mostrando copia temporal');
    await expect(active(page).getByTestId('cart-cache-status')).toContainText('Mostrando copia temporal');
    await expect(active(page).locator('#product-sort')).toHaveValue('price-desc');
    await expect(active(page).locator('#product-availability')).toHaveValue('available');
    await expect(active(page).locator('#product-search')).toHaveValue('');
    assert.deepEqual(await titleList(page), ['Cámara web', 'Mouse Óptico', 'Teclado mecánico']);
    await expect(clearButton(page)).toBeDisabled();
    await expect(active(page).locator('#product-sort')).toBeEnabled();
    await expect(active(page).locator('#product-availability')).toBeEnabled();
    await expect(active(page).locator('.price-bar')).toHaveCount(4);
    await expect(active(page).locator('.stock-bar')).toHaveCount(4);
    await expect(active(page).locator('.cart-slice')).toHaveCount(2);
    await active(page).locator('#product-availability').selectOption('unavailable');
    assert.deepEqual(await titleList(page), ['Audífonos inalámbricos']);
    const screenshot = await capture(page, '05-filtros-recarga-sin-conexion');
    await page.setViewportSize({ width: 390, height: 1000 });
    await assertNoOverflow(page, 390);
    const mobileScreenshot = await capture(page, '05-filtros-recarga-sin-conexion-390');
    assert.equal(state.calls.clear, 0);
    return { screenshot, mobileScreenshot, serviceWorker, offlineSimulation: 'BrowserContext.setOffline(true) y abort de API interceptada', offlineReloadPassed: true, filtersEditableOffline: true, destructiveWritesDisabled: true, chartsProductCount: 4 };
  }, { serviceWorkers: 'allow' });

  await scenario('Catálogo vacío muestra su propio mensaje y deshabilita vaciar un carrito vacío', async page => {
    await openCart(page);
    await expect(active(page).getByRole('heading', { name: 'Estamos preparando el catálogo', exact: true })).toBeVisible();
    await active(page).locator('#product-search').fill('sin coincidencia');
    await expect(active(page).getByRole('heading', { name: 'Estamos preparando el catálogo', exact: true })).toBeVisible();
    await expect(active(page).getByRole('heading', { name: 'Sin coincidencias', exact: true })).toHaveCount(0);
    await expect(active(page).getByTestId('products-result-count')).toHaveText('0 de 0 productos');
    await expect(clearButton(page)).toBeDisabled();
    await expect(active(page).locator('.price-bar')).toHaveCount(0);
    return { emptyCatalogDistinctFromNoResults: true, emptyCartClearDisabled: true };
  }, { empty: true });

  await scenario('Una cuota de almacenamiento agotada no bloquea los filtros ni provoca errores', async page => {
    await openCart(page);
    await active(page).locator('#product-sort').selectOption('price-desc');
    await active(page).locator('#product-availability').selectOption('available');
    assert.deepEqual(await titleList(page), ['Cámara web', 'Mouse Óptico', 'Teclado mecánico']);
    const stored = await page.evaluate(key => localStorage.getItem(key), preferencesKey);
    assert.equal(stored, null);
    await page.reload();
    await expect(active(page).getByTestId('cart-cache-status')).toContainText('Última actualización');
    await expect(active(page).locator('#product-sort')).toHaveValue('default');
    await expect(active(page).locator('#product-availability')).toHaveValue('all');
    return { filtersUsable: true, quotaFailureHandled: true, volatilePreferencesResetAfterReload: true };
  }, { initScript: key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (storageKey, value) {
      if (String(storageKey) === key) throw new DOMException('Cuota de preferencias simulada', 'QuotaExceededError');
      return original.call(this, storageKey, value);
    };
  } });
} finally {
  await browser.close();
  await writeFile(reportPath, JSON.stringify({
    at: new Date().toISOString(), baseURL,
    scope: 'Catálogo y vaciado de carrito con API completamente simulada; sin lecturas ni escrituras reales en PHP/MySQL.',
    apiSimulation: 'BrowserContext.route intercepta todas las rutas /api/, incluidas las escrituras; las rutas inesperadas se bloquean.',
    offlineSimulation: 'Un escenario permite el service worker, desconecta BrowserContext.setOffline(true), aborta la API simulada y recarga desde los recursos locales.',
    preferences: 'localStorage conserva sólo version, sort y availability; la búsqueda no se persiste.',
    screenshots: 'Anchos 1440 y 390 px; altura ampliada al contenido Ionic para capturar su scroll interno.',
    results,
  }, null, 2));
}
if (results.some(result => !result.passed)) process.exitCode = 1;
console.log(`${results.filter(result => result.passed).length}/${results.length} escenarios correctos; evidencia: ${reportPath}`);
