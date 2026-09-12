import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assert, assertNoOverflow, assertNoRuntimeErrors, baseURL, cartKey, expect, launchBrowser, loginReal, makePage, navigate, tokenKey, userKey, waitForImages } from './browser-helpers.mjs';

const artifacts = path.resolve('artifacts/browser');
await mkdir(artifacts, { recursive: true });
const browser = await launchBrowser();
const results = [];
const filter = process.env.E2E_FILTER ? new RegExp(process.env.E2E_FILTER, 'i') : null;
let authenticatedState;
let actualProducts = [];
const productList = /^https:\/\/dummyjson\.com\/products(?:\?.*)?$/;
const productDetail = /^https:\/\/dummyjson\.com\/products\/\d+(?:\?.*)?$/;
const profileUrl = '**/auth/me';
const activeCards = (page) => page.locator('.product-card:visible');
const productOne = (page) => page.locator('.cart-item:visible[data-product-id="1"]');
const quantity = (page) => productOne(page).getByTestId('quantity');

async function test(name, scenario, authenticated = true) {
  if (filter && !filter.test(name) && !name.startsWith('Login: validaciones')) return;
  const started = Date.now();
  const { context, page, diagnostics } = await makePage(browser, authenticated ? authenticatedState : undefined);
  try {
    if (authenticated) assert.ok(authenticatedState, 'Primero debe pasar el login real');
    const detail = await scenario(page, context);
    assertNoRuntimeErrors(diagnostics);
    results.push({ name, passed: true, durationMs: Date.now() - started, ...(detail ? { detail } : {}) });
    console.log(`PASS ${name}`);
  } catch (error) {
    const filename = `failure-${results.length + 1}.png`;
    await page.screenshot({ path: path.join(artifacts, filename) }).catch(() => {});
    results.push({ name, passed: false, durationMs: Date.now() - started, error: error.message, screenshot: filename, diagnostics });
    console.error(`FAIL ${name}: ${error.message}`);
  } finally { await context.close(); }
}

async function setCart(page, entries) {
  await page.evaluate(({ key, entries }) => localStorage.setItem(key, JSON.stringify(entries)), { key: cartKey, entries });
  await navigate(page, '/cart');
}

async function expectCatalog(page) {
  await expect(activeCards(page).first()).toBeVisible();
}

try {
  await test('Guard: todas las rutas privadas y rutas desconocidas requieren sesión', async (page) => {
    const routes = ['/home', '/products', '/product/1', '/cart', '/profile', '/ruta-inexistente'];
    for (const route of routes) {
      await navigate(page, route);
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    }
    return { routes };
  }, false);

  await test('Login: validaciones, error real y sesión real de DummyJSON', async (page, context) => {
    await navigate(page, '/login');
    await expect(page.getByRole('button', { name: /^Ingresar/ })).toBeDisabled();
    await page.locator('ion-input[formcontrolname="username"] input').fill('usuario_inexistente_novacart');
    await page.locator('ion-input[formcontrolname="password"] input').fill('incorrecta');
    await page.getByRole('button', { name: /^Ingresar/ }).click();
    await expect(page.getByRole('alert')).toContainText('Usuario o contraseña incorrectos.');
    assert.equal(await page.evaluate((key) => localStorage.getItem(key) !== null, tokenKey), false);
    const productsResponse = page.waitForResponse((response) => productList.test(response.url()) && response.status() === 200);
    await loginReal(page);
    actualProducts = (await (await productsResponse).json()).products;
    assert.ok(actualProducts.length > 6, 'La sesión real debe consultar el catálogo completo');
    authenticatedState = await context.storageState(); // Sólo en memoria; nunca escribir tokens a disco.
    await page.reload();
    await expectCatalog(page);
    await expect(page).toHaveURL(/\/home$/);
    for (const route of ['/products', '/ruta-inexistente', '/login']) {
      await navigate(page, route);
      await expect(page).toHaveURL(/\/home$/);
      await expectCatalog(page);
    }
    return { productCount: actualProducts.length };
  }, false);

  await test('Login: un fallo de red mantiene al usuario sin autenticar', async (page) => {
    await page.route('**/auth/login', (route) => route.abort('failed'));
    await navigate(page, '/login');
    await page.getByRole('button', { name: 'Usar cuenta de demostración' }).click();
    await page.getByRole('button', { name: /^Ingresar/ }).click();
    await expect(page.getByRole('alert')).toContainText('No pudimos iniciar sesión.');
    await expect(page).toHaveURL(/\/login$/);
    assert.equal(await page.evaluate((key) => localStorage.getItem(key) !== null, tokenKey), false);
  }, false);

  await test('Catálogo: búsqueda global por nombre, categoría, marca y vacío', async (page) => {
    await navigate(page, '/home');
    await expectCatalog(page);
    const search = page.getByRole('searchbox');
    for (const term of ['Essence Mascara', 'fragrances', 'Calvin Klein']) {
      await search.fill(term);
      const expected = actualProducts.filter((product) => [product.title, product.category, product.brand || ''].some((value) => value.toLowerCase().includes(term.toLowerCase())));
      await expect(activeCards(page)).toHaveCount(expected.length);
      for (const product of expected) await expect(page.locator('ion-card-title:visible').filter({ hasText: product.title })).toHaveCount(1);
    }
    await search.fill('sin-coincidencias-novacart-123456');
    await expect(page.getByRole('heading', { name: 'Sin coincidencias' })).toBeVisible();
    await page.getByRole('button', { name: 'Limpiar búsqueda' }).click();
    await expect(activeCards(page)).toHaveCount(actualProducts.length);
  });

  await test('Detalle: producto real, identificador inválido y respuesta 404 real', async (page) => {
    await navigate(page, '/product/1');
    await expect(page.getByRole('heading', { name: 'Essence Mascara Lash Princess' })).toBeVisible();
    await expect(page.getByText('Stock disponible', { exact: true })).toBeVisible();
    await expect(page.getByText('Descuento informado:', { exact: false })).toBeVisible();
    for (const id of ['not-a-product', '999999999']) {
      await navigate(page, `/product/${id}`);
      await expect(page.getByRole('heading', { name: 'Producto no encontrado' })).toBeVisible();
      await expect(page.getByText('Producto del catálogo de respaldo.', { exact: true })).toHaveCount(0);
    }
  });

  await test('Navegación visible: catálogo, detalle, carrito, perfil y contador reactivo', async (page) => {
    await navigate(page, '/home');
    await expectCatalog(page);
    const navigation = page.getByRole('navigation', { name: 'Navegación principal' });
    await expect(navigation.getByRole('link', { name: 'Productos', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('link', { name: 'Ver detalles de Essence Mascara Lash Princess', exact: true }).click();
    await expect(page).toHaveURL(/\/product\/1$/);
    await page.getByRole('button', { name: 'Agregar al carrito', exact: true }).click();
    await page.getByRole('button', { name: 'Agregar al carrito', exact: true }).click();
    await expect(navigation.locator('ion-badge')).toHaveText('2');
    await navigation.getByRole('link', { name: /Carrito/ }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(quantity(page)).toHaveText('2');
    await productOne(page).getByRole('button', { name: /^Aumentar cantidad/ }).click();
    await expect(navigation.locator('ion-badge')).toHaveText('3');
    await navigation.getByRole('link', { name: 'Perfil', exact: true }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByText('emilys', { exact: true })).toBeVisible();
    await expect(page.locator('.profile-loading:visible')).toHaveCount(0);
    await navigation.getByRole('link', { name: 'Productos', exact: true }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expectCatalog(page);
    await expect(navigation.locator('ion-badge')).toHaveText('3');
  });

  await test('Carrito: duplicados, subtotal, persistencia, límites, eliminación y vaciado', async (page) => {
    const product = actualProducts.find((item) => item.id === 1);
    await navigate(page, '/product/1');
    const add = page.getByRole('button', { name: 'Agregar al carrito', exact: true });
    await add.click();
    await add.click();
    await navigate(page, '/cart');
    await expect(page.locator('.cart-item:visible')).toHaveCount(1);
    await expect(quantity(page)).toHaveText('2');
    const increase = productOne(page).getByRole('button', { name: /^Aumentar cantidad/ });
    const decrease = productOne(page).getByRole('button', { name: /^Disminuir cantidad/ });
    await increase.click();
    await expect(quantity(page)).toHaveText('3');
    await expect(page.getByTestId('cart-total')).toContainText((Math.round(product.price * 100) * 3 / 100).toFixed(2));
    await page.reload();
    await expect(quantity(page)).toHaveText('3');
    await decrease.click();
    await decrease.click();
    await expect(quantity(page)).toHaveText('1');
    await expect(decrease).toBeDisabled();
    await setCart(page, [{ product, quantity: product.stock - 1 }]);
    await increase.click();
    await expect(quantity(page)).toHaveText(String(product.stock));
    await expect(increase).toBeDisabled();
    await productOne(page).getByRole('button', { name: /^Eliminar/ }).click();
    await expect(page.locator('.cart-item:visible')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Finalizar compra/ })).toBeDisabled();
    await setCart(page, [{ product, quantity: 1 }]);
    const clear = page.getByRole('region', { name: 'Productos del carrito' }).getByRole('button', { name: 'Vaciar carrito', exact: true });
    await clear.click();
    const dialog = page.getByRole('alertdialog');
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(quantity(page)).toHaveText('1');
    await clear.click();
    await dialog.getByRole('button', { name: 'Vaciar carrito', exact: true }).click();
    await expect(page.locator('.cart-item:visible')).toHaveCount(0);
  });

  await test('Compra simulada: el carrito se limpia sólo después de aceptar', async (page) => {
    await navigate(page, '/cart');
    await setCart(page, [{ product: actualProducts.find((item) => item.id === 1), quantity: 2 }]);
    await page.getByRole('button', { name: /^Finalizar compra/ }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('¡Compra simulada correctamente!');
    assert.equal(await page.evaluate((key) => JSON.parse(localStorage.getItem(key))[0].quantity, cartKey), 2);
    await dialog.getByRole('button', { name: 'Aceptar', exact: true }).click();
    await expect(page.locator('.cart-item:visible')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Finalizar compra/ })).toBeDisabled();
  });

  await test('Perfil real, sanitización de datos y logout conservando carrito', async (page) => {
    await navigate(page, '/cart');
    await setCart(page, [{ product: actualProducts.find((item) => item.id === 1), quantity: 1 }]);
    await navigate(page, '/profile');
    await expect(page.getByText('emilys', { exact: true })).toBeVisible();
    await expect(page.locator('.profile-loading:visible')).toHaveCount(0);
    const keys = await page.evaluate((key) => Object.keys(JSON.parse(localStorage.getItem(key))), userKey);
    assert.ok(keys.every((key) => ['id', 'username', 'email', 'firstName', 'lastName', 'image'].includes(key)));
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    const stored = await page.evaluate(({ tokenKey, userKey, cartKey }) => ({ hasToken: localStorage.getItem(tokenKey) !== null, hasUser: localStorage.getItem(userKey) !== null, cartCount: JSON.parse(localStorage.getItem(cartKey)).length }), { tokenKey, userKey, cartKey });
    assert.deepEqual(stored, { hasToken: false, hasUser: false, cartCount: 1 });
    await navigate(page, '/profile');
    await expect(page).toHaveURL(/\/login$/);
  });

  await test('Respaldo: fallo de red del catálogo, seis imágenes locales y recuperación', async (page) => {
    await page.route(productList, (route) => route.abort('failed'));
    await navigate(page, '/home');
    await expect(page.getByText('Estás viendo el catálogo de respaldo.', { exact: true })).toBeVisible();
    await expect(activeCards(page)).toHaveCount(6);
    const sources = await activeCards(page).locator('img').evaluateAll((images) => images.map((img) => img.getAttribute('src')));
    assert.equal(sources.length, 6);
    assert.ok(sources.every((src) => src.startsWith('assets/products/')));
    await page.unroute(productList);
    await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
    await expect(activeCards(page)).toHaveCount(actualProducts.length);
    await expect(page.getByText('Estás viendo el catálogo de respaldo.', { exact: true })).toHaveCount(0);
  });

  await test('Respaldo: errores 5xx, detalle local y detalle sin copia disponible', async (page) => {
    await page.route(productList, (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"Prueba: servicio no disponible"}' }));
    await page.route(productDetail, (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"Prueba: servicio no disponible"}' }));
    await navigate(page, '/home');
    await expect(page.getByText('Estás viendo el catálogo de respaldo.', { exact: true })).toBeVisible();
    await navigate(page, '/product/1');
    await expect(page.getByText('Producto del catálogo de respaldo.', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Essence Mascara Lash Princess' })).toBeVisible();
    await navigate(page, '/product/100');
    await expect(page.getByRole('heading', { name: 'No pudimos cargar el producto' })).toBeVisible();
    await expect(page.getByText('Producto del catálogo de respaldo.', { exact: true })).toHaveCount(0);
  });

  await test('Los errores HTTP 4xx no activan el catálogo de respaldo', async (page) => {
    await page.route(productList, (route) => route.fulfill({ status: 400, contentType: 'application/json', body: '{"message":"Prueba: petición incorrecta"}' }));
    await navigate(page, '/home');
    await expect(page.getByRole('heading', { name: 'No pudimos abrir el catálogo' })).toBeVisible();
    await expect(page.getByText('Estás viendo el catálogo de respaldo.', { exact: true })).toHaveCount(0);
  });

  await test('Perfil: error de red recuperable y cierre de sesión ante 401', async (page) => {
    await page.route(profileUrl, (route) => route.abort('failed'));
    await navigate(page, '/profile');
    await expect(page.getByRole('button', { name: 'Reintentar', exact: true })).toBeVisible();
    assert.ok(await page.evaluate((key) => Boolean(localStorage.getItem(key)), tokenKey));
    await page.unroute(profileUrl);
    await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
    await expect(page.getByText('emilys', { exact: true })).toBeVisible();
    await expect(page.locator('.profile-loading:visible')).toHaveCount(0);
    await page.route(profileUrl, (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"Prueba: token inválido"}' }));
    await page.reload();
    await expect(page).toHaveURL(/\/login$/);
    assert.equal(await page.evaluate((key) => localStorage.getItem(key) !== null, tokenKey), false);
  });

  await test('Sesión: token vencido, usuario corrupto y carrito corrupto', async (page) => {
    await navigate(page, '/cart');
    await page.evaluate((key) => localStorage.setItem(key, '{'), cartKey);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Tu próxima compra empieza aquí' })).toBeVisible();
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), cartKey), '[]');
    await page.evaluate((key) => localStorage.setItem(key, `header.${btoa(JSON.stringify({ exp: 1 }))}.signature`), tokenKey);
    await navigate(page, '/home');
    await expect(page).toHaveURL(/\/login$/);
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), userKey), null);
    const saved = authenticatedState.origins.find((entry) => entry.origin === new URL(baseURL).origin).localStorage;
    await page.evaluate(({ saved, userKey }) => { for (const entry of saved) localStorage.setItem(entry.name, entry.value); localStorage.setItem(userKey, '{'); }, { saved, userKey });
    await navigate(page, '/profile');
    await expect(page).toHaveURL(/\/login$/);
    assert.equal(await page.evaluate((key) => localStorage.getItem(key) !== null, tokenKey), false);
  });

  await test('Presentación responsive: cinco vistas a 390, 768 y 1440 píxeles', async (page, context) => {
    const measurements = [];
    await navigate(page, '/cart');
    await setCart(page, [{ product: actualProducts.find((item) => item.id === 1), quantity: 2 }]);
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      for (const route of ['/home', '/product/1', '/cart', '/profile']) {
        await navigate(page, route);
        if (route === '/home') await expectCatalog(page);
        if (route === '/product/1') await expect(page.getByRole('heading', { name: 'Essence Mascara Lash Princess' })).toBeVisible();
        if (route === '/cart') await expect(productOne(page)).toBeVisible();
        if (route === '/profile') await expect(page.getByText('emilys', { exact: true })).toBeVisible();
        await waitForImages(page);
        measurements.push({ route, width, measurements: await assertNoOverflow(page, width) });
        await page.screenshot({ path: path.join(artifacts, `${width}-${route.slice(1).replaceAll('/', '-')}.png`), animations: 'disabled' });
      }
    }
    await context.clearCookies();
    await page.evaluate(() => localStorage.clear());
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      await navigate(page, '/login');
      await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
      await waitForImages(page);
      measurements.push({ route: '/login', width, measurements: await assertNoOverflow(page, width) });
      await page.screenshot({ path: path.join(artifacts, `${width}-login.png`), animations: 'disabled' });
    }
    return measurements;
  });
} finally {
  await browser.close();
  const report = { executedAt: new Date().toISOString(), baseURL, ...(filter ? { filter: process.env.E2E_FILTER } : {}), passed: results.filter((result) => result.passed).length, failed: results.filter((result) => !result.passed).length, results };
  const reportName = filter ? 'verification-focused.json' : 'verification.json';
  await writeFile(path.join(artifacts, reportName), JSON.stringify(report, null, 2) + '\n');
  console.log(`Verificación: ${report.passed} grupos correctos, ${report.failed} fallidos. Informe: artifacts/browser/${reportName}`);
  if (report.failed) process.exitCode = 1;
}
