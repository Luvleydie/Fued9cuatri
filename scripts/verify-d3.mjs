import { mkdir, writeFile } from 'node:fs/promises';
import { assert, expect, baseURL, launchBrowser, makePage, navigate, assertNoOverflow } from './browser-helpers.mjs';

// Datos deterministas y API completamente interceptada: no modifica MySQL.
const products = [
  { id: 11, title: 'Mouse de prueba', price: 125, stock: 5 },
  { id: 12, title: 'Teclado de prueba', price: 50, stock: 3 },
  { id: 13, title: 'Audífonos de prueba', price: 0, stock: 0 },
];
const account = { id: 910, username: 'emilys', firstName: 'Emily', lastName: 'Prueba', email: 'emily@example.test' };
const items = products.slice(0, 2).map((p, i) => ({ productId: p.id, title: p.title, price: p.price, stock: p.stock, quantity: i === 0 ? 2 : 1 }));
const results = [];
const browser = await launchBrowser();
await mkdir('docs/evidencia', { recursive: true });
await mkdir('docs/screenshots-diseno', { recursive: true });
const active = page => page.locator(`app-${new URL(page.url()).pathname.split('/').pop()}:not(.ion-page-hidden)`);

async function setup(context, { empty = false, zero = false } = {}) {
  const unexpected = [];
  let cart = empty ? { items: [], total: 0 } : { items: structuredClone(items), total: 300 };
  let catalog = empty ? [] : structuredClone(products);
  if (zero) {
    catalog = [{ id: 11, title: 'Artículo sin importe', price: 0, stock: 5 }];
    cart = { items: [{ productId: 11, title: 'Artículo sin importe', price: 0, stock: 5, quantity: 2 }], total: 0 };
  }
  let updates = 0;
  await context.route('**/api/**', async route => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname.split('/api/')[1];
    const method = request.method();
    if (method === 'POST' && endpoint === 'auth/login') return route.fulfill({ json: { ...account, accessToken: 'c'.repeat(64), expiresAt: Math.floor(Date.now() / 1000) + 3600 } });
    if (method === 'POST' && endpoint === 'auth/logout') return route.fulfill({ status: 204 });
    if (method === 'GET' && endpoint === 'users') return route.fulfill({ json: { users: [account] } });
    if (method === 'GET' && endpoint === 'products') return route.fulfill({ json: { products: catalog } });
    if (method === 'GET' && endpoint === 'cart') return route.fulfill({ json: cart });
    if (method === 'PUT' && endpoint === 'cart/12') {
      updates++;
      if (updates > 1) return route.fulfill({ status: 503, json: { message: 'Error simulado' } });
      cart.items[1].quantity = request.postDataJSON().quantity;
      cart.total = cart.items.reduce((total, item) => total + item.price * item.quantity, 0);
      return route.fulfill({ json: cart });
    }
    unexpected.push(`${method} ${endpoint}`);
    return route.abort('blockedbyclient');
  });
  return { unexpected };
}

async function login(page) {
  await navigate(page, 'login');
  await active(page).getByRole('button', { name: 'Usar cuenta demo', exact: true }).click();
  await active(page).getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(active(page).locator('.user-row')).toHaveCount(1);
}

async function openCart(page) {
  await active(page).getByRole('link', { name: 'Carrito', exact: true }).click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(active(page).getByRole('button', { name: 'Actualizar', exact: true })).toBeEnabled();
  await expect(page.locator('app-home:not(.ion-page-hidden)')).toHaveCount(0);
}

async function capture(page, name) {
  const viewport = page.viewportSize();
  await expect(page.locator('app-login:not(.ion-page-hidden),app-register:not(.ion-page-hidden),app-home:not(.ion-page-hidden),app-cart:not(.ion-page-hidden)')).toHaveCount(1);
  const main = active(page).locator('main');
  const fullHeight = await main.evaluate(node => node.scrollHeight + 170);
  const path = `docs/screenshots-diseno/${name}.png`;
  const masks = [active(page).getByText(/^Demo:/)];
  for (const input of await active(page).locator('input[formControlName="password"],input[formControlName="confirmPassword"]').all()) {
    if (await input.inputValue()) masks.push(input);
  }
  try {
    await page.setViewportSize({ width: viewport.width, height: Math.max(viewport.height, fullHeight) });
    await main.evaluate(async node => { await node.closest('ion-content').scrollToTop(0); });
    await page.screenshot({ path, fullPage: true, animations: 'disabled', maskColor: '#d7d2e4', mask: masks });
  } finally { await page.setViewportSize(viewport); }
  return path;
}

async function scenario(name, callback, options = {}) {
  const { context, page, errors } = await makePage(browser, { serviceWorkers: 'block' });
  const state = await setup(context, options);
  try {
    const evidence = await callback(page, context);
    assert.deepEqual(errors, [], 'Sin errores del navegador');
    assert.deepEqual(state.unexpected, [], 'Todas las llamadas API previstas');
    results.push({ name, passed: true, ...evidence });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, passed: false, error: error.message });
    console.error(`FAIL ${name}: ${error.message}`);
  } finally { await context.close(); }
}

try {
  await scenario('Tres gráficas D3 con escalas, valores reales y actualización confirmada', async page => {
    await login(page); await openCart(page);
    const scope = active(page);
    for (const chart of ['price-chart', 'stock-chart', 'cart-chart']) await expect(scope.getByTestId(chart)).toHaveCount(1);
    await expect(scope.locator('.price-bar')).toHaveCount(3);
    await expect(scope.locator('.stock-bar')).toHaveCount(3);
    await expect(scope.locator('.cart-slice')).toHaveCount(2);
    const bar = id => scope.locator(`.price-bar[data-product-id="${id}"]`);
    assert.equal(Number(await bar(11).getAttribute('data-value')), 125);
    const ratio = Number(await bar(11).getAttribute('width')) / Number(await bar(12).getAttribute('width'));
    assert.ok(Math.abs(ratio - 2.5) < .01, 'Longitud proporcional al precio');
    await scope.locator('#cart-quantity-12').fill('2');
    await scope.getByRole('button', { name: 'Guardar cantidad Teclado de prueba', exact: true }).click();
    const slice = scope.locator('.cart-slice[data-product-id="12"]');
    await expect(slice).toHaveAttribute('data-value', '100');
    await expect(scope.locator('.cart-slice')).toHaveCount(2);
    const screenshot = await capture(page, '04-carrito-graficas-1440');
    for (const width of [768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await assertNoOverflow(page, width);
      await expect(scope.getByTestId('cart-chart')).toHaveAttribute('viewBox', /.+/);
    }
    const mobileScreenshot = await capture(page, '04-carrito-graficas-390');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await scope.locator('#cart-quantity-12').fill('3');
    await scope.getByRole('button', { name: 'Guardar cantidad Teclado de prueba', exact: true }).click();
    await expect(scope.getByRole('alert')).toBeVisible();
    await expect(slice).toHaveAttribute('data-value', '100');
    const failedWriteScreenshot = await capture(page, '05-carrito-error-conservado');
    return { charts: 3, amounts: [250, 100], failedWritePreservesChart: true, screenshot, mobileScreenshot, failedWriteScreenshot };
  });

  await scenario('Catálogo vacío y total cero producen estados claros sin geometría inválida', async page => {
    await login(page); await openCart(page);
    await expect(active(page).locator('.cart-slice')).toHaveCount(0);
    await expect(active(page).locator('.price-bar')).toHaveCount(0);
    const invalid = await active(page).locator('app-cart-charts').evaluate(node => /NaN|Infinity/.test(node.innerHTML));
    assert.equal(invalid, false);
    return { invalidGeometry: false, emptyState: true };
  }, { empty: true });

  await scenario('Un carrito con precio cero conserva la tabla y no inventa porcentajes', async page => {
    await login(page); await openCart(page);
    await expect(active(page).locator('.cart-slice')).toHaveCount(0);
    await expect(active(page).getByTestId('cart-total')).toContainText('0.00');
    const invalid = await active(page).locator('app-cart-charts').evaluate(node => /NaN|Infinity/.test(node.innerHTML));
    assert.equal(invalid, false);
    return { invalidGeometry: false, zeroTotalHandled: true };
  }, { zero: true });

  await scenario('Diseño y búsquedas funcionan en las cuatro pantallas a 1440 y 390 px', async page => {
    const screenshots = [];
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const [route, name] of [['login', '01-login'], ['register', '02-registro']]) {
        await navigate(page, route);
        await expect(active(page).locator('h1')).toBeVisible();
        await assertNoOverflow(page, width);
        screenshots.push(await capture(page, `${name}-${width}`));
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await login(page);
    await active(page).locator('#input-search-users').fill('sin-coincidencia');
    await expect(active(page).locator('.user-row')).toHaveCount(0);
    await active(page).getByRole('button', { name: 'Limpiar búsqueda', exact: true }).first().click();
    await expect(active(page).locator('.user-row')).toHaveCount(1);
    screenshots.push(await capture(page, '03-usuarios-1440'));
    const desktopBounds = await active(page).evaluate(node => ({
      sidebarRight: node.querySelector('.app-sidebar').getBoundingClientRect().right,
      contentLeft: node.querySelector('ion-content').getBoundingClientRect().left,
    }));
    assert.ok(desktopBounds.contentLeft >= desktopBounds.sidebarRight - 1, 'El menú lateral no debe tapar el contenido');
    await page.setViewportSize({ width: 390, height: 1000 });
    await assertNoOverflow(page, 390);
    screenshots.push(await capture(page, '03-usuarios-390'));
    await openCart(page);
    await active(page).locator('#product-search').fill('teclado');
    await expect(active(page).locator('.product-card')).toHaveCount(1);
    await expect(active(page).locator('.price-bar')).toHaveCount(3);
    return { screenshots, searchDoesNotChangeAnalytics: true };
  });
} finally {
  await browser.close();
  await writeFile('docs/evidencia/d3-verificacion.json', JSON.stringify({ at: new Date().toISOString(), baseURL, scope: 'UI y D3 con API simulada; no modifica MySQL. Anchos 1440, 768 y 390; capturas con altura ampliada al contenido Ionic.', results }, null, 2));
}
if (results.some(result => !result.passed)) process.exitCode = 1;
