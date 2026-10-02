import { mkdir, writeFile } from 'node:fs/promises';
import { assert, expect, baseURL, launchBrowser, makePage, navigate, assertNoOverflow } from './browser-helpers.mjs';

// Estos escenarios verifican la UI contra respuestas deterministas y fallos simulados.
// Ninguna petición a /api/ alcanza PHP/MySQL, incluidos login y escrituras.
const reportPath = 'docs/evidencia/data-driven-verificacion.json';
const screenshotDirectory = 'docs/screenshots-data-driven';
const currentUser = { id: 901, username: 'emilys', firstName: 'Emily', lastName: 'Prueba', email: 'emily@example.test' };
const otherUser = { id: 902, username: 'usuario_prueba', firstName: 'Usuario', lastName: 'Prueba', email: 'usuario@example.test' };
const products = [
  { id: 11, title: 'Mouse de prueba', price: 125, stock: 5 },
  { id: 12, title: 'Teclado de prueba', price: 50, stock: 3 },
];
const cart = {
  items: products.map((product, index) => ({ productId: product.id, title: product.title, price: product.price, stock: product.stock, quantity: index === 0 ? 2 : 1 })),
  total: 300,
};
const testPassword = 'Formulario-prueba-123';
const results = [];
const browser = await launchBrowser();

// Ionic conserva la página anterior durante la transición: limitar por componente.
const active = page => {
  const route = new URL(page.url()).pathname.replace(/\/$/, '').split('/').pop();
  assert.ok(['home', 'cart', 'login', 'register'].includes(route), 'Ruta conocida de la aplicación.');
  return page.locator(`app-${route}:not(.ion-page-hidden) main`);
};
const submit = (page, name) => active(page).getByRole('button', { name, exact: true });

await mkdir('docs/evidencia', { recursive: true });
await mkdir(screenshotDirectory, { recursive: true });

async function capture(page, name) {
  const path = `${screenshotDirectory}/${name}.png`;
  await expect(page.locator('app-login:not(.ion-page-hidden), app-register:not(.ion-page-hidden), app-home:not(.ion-page-hidden), app-cart:not(.ion-page-hidden)')).toHaveCount(1);
  const viewport = page.viewportSize();
  const fullHeight = await active(page).evaluate(main => Math.ceil(main.scrollHeight) + 100);
  try {
    // ion-content tiene scroll interno: ampliar solo altura evita cortar la evidencia.
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

async function captureSizes(page, name) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await assertNoOverflow(page, 1440);
  const desktop = await capture(page, name);
  await page.setViewportSize({ width: 390, height: 1000 });
  await assertNoOverflow(page, 390);
  const mobile = await capture(page, `${name}-movil`);
  await page.setViewportSize({ width: 1440, height: 1000 });
  return { desktop, mobile };
}

async function mockApi(context) {
  const calls = { login: 0, register: 0, createUser: 0, cartUpdate: 0, cartDelete: 0, unexpected: [] };
  const payloads = {};
  let currentCart = structuredClone(cart);
  await context.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.split('/api/')[1];
    const method = request.method();
    if (method === 'GET' && path === 'users') return route.fulfill({ json: { users: [currentUser, otherUser] } });
    if (method === 'GET' && path === 'products') return route.fulfill({ json: { products } });
    if (method === 'GET' && path === 'cart') return route.fulfill({ json: currentCart });
    if (method === 'POST' && path === 'auth/login') {
      calls.login++;
      payloads.login = request.postDataJSON();
      return route.fulfill({ json: { ...currentUser, accessToken: 'a'.repeat(64), expiresAt: Math.floor(Date.now() / 1000) + 3600 } });
    }
    if (method === 'POST' && path === 'auth/register') {
      calls.register++;
      payloads.register = request.postDataJSON();
      return route.fulfill({ status: 400, json: { message: 'Revisa el correo indicado.', errors: { email: 'El correo fue rechazado por el servidor de prueba.' } } });
    }
    if (method === 'POST' && path === 'users') {
      calls.createUser++;
      payloads.createUser = request.postDataJSON();
      return route.fulfill({ status: 503, json: { message: 'Fallo de guardado simulado.' } });
    }
    if (method === 'DELETE' && path === 'cart/11') {
      calls.cartDelete++;
      currentCart = { items: [cart.items[1]], total: 50 };
      return route.fulfill({ json: currentCart });
    }
    if (method === 'PUT' && path === 'cart/12') {
      calls.cartUpdate++;
      payloads.cartUpdates ??= [];
      const body = request.postDataJSON();
      payloads.cartUpdates.push({ productId: 12, body });
      if (calls.cartUpdate === 1) {
        currentCart = { items: [{ ...cart.items[1], quantity: body.quantity }], total: 50 * body.quantity };
        return route.fulfill({ json: currentCart });
      }
      return route.fulfill({ status: 503, json: { message: 'Fallo de cantidad simulado.' } });
    }
    calls.unexpected.push(`${method} ${path}`);
    return route.abort('blockedbyclient');
  });
  return { calls, payloads };
}

async function scenario(name, callback) {
  // Impedir que un service worker intercepte solicitudes antes que los mocks.
  const { context, page, errors } = await makePage(browser, { serviceWorkers: 'block' });
  const startedAt = Date.now();
  const state = await mockApi(context);
  try {
    const evidence = await callback(page, state);
    assert.deepEqual(errors, [], 'Cero excepciones no tratadas en el navegador.');
    assert.deepEqual(state.calls.unexpected, [], 'Todas las peticiones API deben estar previstas e interceptadas.');
    results.push({ name, passed: true, durationMs: Date.now() - startedAt, browserErrors: errors, calls: state.calls, ...evidence });
    console.log(`PASS ${name}`);
  } catch (error) {
    const screenshot = await capture(page, `fallo-${results.length + 1}`).catch(() => undefined);
    results.push({ name, passed: false, durationMs: Date.now() - startedAt, error: error.message, browserErrors: errors, calls: state.calls, screenshot });
    console.error(`FAIL ${name}: ${error.message}`);
  } finally {
    await context.close();
  }
}

async function loginMock(page) {
  await navigate(page, 'login');
  await submit(page, 'Usar cuenta demo').click();
  await submit(page, 'Ingresar').click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(active(page).getByTestId('users-cache-status')).toContainText('Última actualización');
  await expect(active(page).locator('.user-row')).toHaveCount(2);
  await expect(active(page).locator('#user-username')).toBeEnabled();
}

async function fillUser(page, prefix, { invalid = false } = {}) {
  const firstNameId = prefix === 'register' ? 'firstname' : 'firstName';
  const lastNameId = prefix === 'register' ? 'lastname' : 'lastName';
  await active(page).locator(`#${prefix}-username`).fill(invalid ? 'usuario con espacios' : 'nuevo_usuario');
  await active(page).locator(`#${prefix}-${firstNameId}`).fill('Nombre');
  await active(page).locator(`#${prefix}-${lastNameId}`).fill('Prueba');
  await active(page).locator(`#${prefix}-email`).fill(invalid ? 'correo-invalido' : 'nuevo@example.test');
  await active(page).locator(`#${prefix}-password`).fill(testPassword);
  await active(page).locator(`#${prefix}-confirm-password`).fill(testPassword);
  await active(page).locator(`#${prefix}-confirm-password`).blur();
}

try {
  await scenario('Login: formulario inválido, patch de demo y sesión sin contraseña', async (page, { calls, payloads }) => {
    await navigate(page, 'login');
    await expect(submit(page, 'Ingresar')).toBeDisabled();
    await active(page).locator('#login-username').fill('   ');
    await active(page).locator('#login-password').fill('secreto');
    await active(page).locator('form').dispatchEvent('submit');
    await expect(active(page).locator('#login-username')).toHaveAttribute('aria-invalid', 'true');
    assert.equal(calls.login, 0, 'Una invocación de submit inválida no llega a la API.');
    await submit(page, 'Usar cuenta demo').click();
    await expect(active(page).locator('#login-username')).toHaveValue('emilys');
    await expect(active(page).locator('#login-password')).toHaveValue('emilyspass');
    await expect(submit(page, 'Ingresar')).toBeEnabled();
    const screenshots = await captureSizes(page, '01-login-modelo-valido');
    await submit(page, 'Ingresar').click();
    await expect(page).toHaveURL(/\/home$/);
    assert.equal(calls.login, 1);
    assert.deepEqual(Object.keys(payloads.login).sort(), ['password', 'username']);
    const stored = await page.evaluate(() => JSON.stringify({ ...sessionStorage }));
    assert.ok(!stored.includes('emilyspass') && !stored.includes('"password"'), 'La sesión no persiste contraseñas.');
    return { screenshots, invalidSubmitBlocked: true, demoPatched: true, passwordNotStored: true };
  });

  await scenario('Registro: validadores locales, confirmación y errores por campo del servidor', async (page, { calls, payloads }) => {
    await navigate(page, 'register');
    await fillUser(page, 'register', { invalid: true });
    await expect(submit(page, 'Crear cuenta')).toBeDisabled();
    await active(page).locator('form').dispatchEvent('submit');
    await expect(active(page).locator('#register-username-error')).toContainText('sin espacios');
    await expect(active(page).locator('#register-email-error')).toContainText('correo');
    await expect(active(page).locator('#register-email')).toHaveAttribute('aria-invalid', 'true');
    assert.equal(calls.register, 0);
    const invalidScreenshots = await captureSizes(page, '02-registro-validacion-local');
    await active(page).locator('#register-username').fill('nuevo_usuario');
    await active(page).locator('#register-email').fill('nuevo@example.test');
    await active(page).locator('#register-confirm-password').fill('Otra-clave-123');
    await active(page).locator('#register-confirm-password').blur();
    await expect(active(page).locator('#register-confirm-password-error')).toContainText('no coinciden');
    await expect(submit(page, 'Crear cuenta')).toBeDisabled();
    assert.equal(calls.register, 0);
    await active(page).locator('#register-confirm-password').fill(testPassword);
    await expect(submit(page, 'Crear cuenta')).toBeEnabled();
    await submit(page, 'Crear cuenta').click();
    await expect(active(page).locator('#register-email-error')).toHaveText('El correo fue rechazado por el servidor de prueba.');
    await expect(active(page).locator('#register-email')).toHaveAttribute('aria-describedby', /register-email-error/);
    assert.equal(calls.register, 1);
    assert.deepEqual(Object.keys(payloads.register).sort(), ['email', 'firstName', 'lastName', 'password', 'username']);
    const serverScreenshot = await capture(page, '03-registro-error-servidor');
    await active(page).locator('#register-email').fill('corregido@example.test');
    await expect(active(page).locator('#register-email-error')).toHaveCount(0);
    await expect(submit(page, 'Crear cuenta')).toBeEnabled();
    return { invalidScreenshots, serverScreenshot, invalidRequests: 0, confirmationOnlyInUi: true, serverErrorClearedOnEdit: true };
  });

  await scenario('Usuarios: crear/editar, reglas de contraseña y datos conservados ante 503', async (page, { calls, payloads }) => {
    await loginMock(page);
    await active(page).locator('form').dispatchEvent('submit');
    await expect(submit(page, 'Crear usuario')).toBeDisabled();
    assert.equal(calls.createUser, 0);
    await active(page).getByRole('button', { name: 'Editar usuario_prueba', exact: true }).click();
    await expect(active(page).locator('#user-username')).toHaveValue(otherUser.username);
    await expect(active(page).locator('#user-password')).toHaveValue('');
    await expect(active(page).locator('#user-confirm-password')).toHaveValue('');
    await expect(submit(page, 'Guardar cambios')).toBeEnabled();
    await submit(page, 'Cancelar').click();
    await expect(active(page).locator('#user-username')).toHaveValue('');
    await fillUser(page, 'user');
    await active(page).locator('#user-password').fill('');
    await active(page).locator('#user-confirm-password').fill('');
    await expect(submit(page, 'Crear usuario')).toBeDisabled();
    await active(page).locator('#user-password').fill(testPassword);
    await active(page).locator('#user-confirm-password').fill(testPassword);
    await expect(submit(page, 'Crear usuario')).toBeEnabled();
    await submit(page, 'Crear usuario').click();
    await expect(active(page).getByRole('alert')).toContainText('No pudimos confirmar');
    await expect(active(page).locator('#user-username')).toHaveValue('nuevo_usuario');
    await expect(active(page).locator('#user-password')).toHaveValue(testPassword);
    await expect(active(page).locator('#user-confirm-password')).toHaveValue(testPassword);
    await expect(submit(page, 'Crear usuario')).toBeDisabled();
    await expect(active(page).locator('.user-row')).toHaveCount(2);
    assert.equal(calls.createUser, 1, 'La escritura fallida no se reintenta automáticamente.');
    assert.deepEqual(Object.keys(payloads.createUser).sort(), ['email', 'firstName', 'lastName', 'password', 'username']);
    const screenshots = await captureSizes(page, '04-usuarios-fallo-datos-conservados');
    await submit(page, 'Actualizar').click();
    await expect(active(page).locator('#user-username')).toBeEnabled();
    await expect(active(page).locator('#user-username')).toHaveValue('nuevo_usuario');
    assert.equal(calls.createUser, 1);
    return { screenshots, editPasswordOptional: true, createPasswordRequired: true, formPreserved: true, confirmationOnlyInUi: true, noRecordCreated: true };
  });

  await scenario('Carrito: FormArray, reindexación tras quitar una fila y borrador conservado ante 503', async (page, { calls, payloads }) => {
    await loginMock(page);
    await page.locator('app-home:not(.ion-page-hidden)').getByRole('link', { name: 'Carrito', exact: true }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(active(page).getByTestId('cart-cache-status')).toContainText('Última actualización');
    await expect(active(page).locator('input[id^="cart-quantity-"]')).toHaveCount(2);
    const quantity = active(page).locator('#cart-quantity-11');
    const saveQuantity = submit(page, 'Guardar cantidad Mouse de prueba');
    await expect(quantity).toHaveValue('2');
    for (const value of ['0', '1.5', '6']) {
      await quantity.fill(value);
      await quantity.blur();
      await expect(saveQuantity).toBeDisabled();
      await expect(quantity).toHaveAttribute('aria-invalid', 'true');
      assert.equal(calls.cartUpdate, 0, `Cantidad ${value} rechazada antes de PUT.`);
    }
    const invalidScreenshots = await captureSizes(page, '05-carrito-cantidad-invalida');

    // Si @for conserva el nodo por productId pero FormArray cambia su índice,
    // el control visual puede conservar el binding de la fila eliminada.
    await submit(page, 'Quitar Mouse de prueba').click();
    await expect(active(page).locator('#cart-quantity-11')).toHaveCount(0);
    await expect(active(page).locator('input[id^="cart-quantity-"]')).toHaveCount(1);
    const survivingQuantity = active(page).locator('#cart-quantity-12');
    const saveSurvivingQuantity = submit(page, 'Guardar cantidad Teclado de prueba');
    const savedQuantity = active(page).locator('[data-product-id="12"]').getByTestId('quantity');
    await expect(survivingQuantity).toHaveValue('1');
    await expect(savedQuantity).toHaveText('1');
    await survivingQuantity.fill('2');
    await expect(saveSurvivingQuantity).toBeEnabled();
    await saveSurvivingQuantity.click();
    await expect(savedQuantity).toHaveText('2');
    assert.equal(calls.cartDelete, 1);
    assert.equal(calls.cartUpdate, 1);
    assert.deepEqual(payloads.cartUpdates[0], { productId: 12, body: { quantity: 2 } }, 'La fila reindexada envía el ID y cantidad del producto sobreviviente.');
    const reindexedScreenshot = await capture(page, '06-carrito-fila-reindexada');
    const confirmedTotal = await active(page).getByTestId('cart-total').innerText();

    await survivingQuantity.fill('3');
    await expect(saveSurvivingQuantity).toBeEnabled();
    await saveSurvivingQuantity.click();
    await expect(active(page).getByRole('alert')).toContainText('No pudimos confirmar');
    await expect(survivingQuantity).toHaveValue('3');
    await expect(savedQuantity).toHaveText('2');
    await expect(active(page).getByTestId('cart-total')).toHaveText(confirmedTotal);
    await expect(saveSurvivingQuantity).toBeDisabled();
    assert.equal(calls.cartUpdate, 2);
    assert.deepEqual(payloads.cartUpdates[1], { productId: 12, body: { quantity: 3 } });
    const failedScreenshot = await capture(page, '07-carrito-borrador-conservado');
    return { invalidScreenshots, reindexedScreenshot, failedScreenshot, initialFormArrayRows: 2, rowsAfterDelete: 1, survivingProductId: 12, reindexedControlSavedCorrectly: true, invalidQuantities: [0, 1.5, 6], draftQuantity: 3, confirmedQuantity: 2, confirmedTotalUnchanged: true };
  });
} finally {
  await browser.close();
  await writeFile(reportPath, JSON.stringify({
    at: new Date().toISOString(),
    baseURL,
    scope: 'UI Reactive Forms: datos y errores API simulados en contextos aislados, sin mutaciones reales en MySQL.',
    apiSimulation: 'Playwright BrowserContext.route; todas las rutas /api/ interceptadas; las inesperadas se bloquean.',
    serviceWorkers: 'Bloqueados para garantizar la intercepción; funcionamiento offline se verifica en test:offline.',
    screenshots: 'Los campos de contraseña y la leyenda demo se enmascaran. Anchos 1440 y 390 px; altura ampliada al contenido para capturar el scroll interno de Ionic, con animaciones desactivadas.',
    results,
  }, null, 2));
}

if (results.some(result => !result.passed)) process.exitCode = 1;
console.log(`${results.filter(result => result.passed).length}/${results.length} escenarios correctos; evidencia: ${reportPath}`);
