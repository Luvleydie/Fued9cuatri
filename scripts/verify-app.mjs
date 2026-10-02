import { mkdir, writeFile } from 'node:fs/promises';
import { assert, expect, baseURL, tokenKey, userKey, launchBrowser, makePage, navigate, loginReal, assertNoOverflow } from './browser-helpers.mjs';
const browser = await launchBrowser();
const result = [];
const prefix = 'web_' + Date.now();
const password = 'Browser-pass-123';
const created = [];
async function scenario(name, callback) {
  const { context, page, errors } = await makePage(browser);
  try {
    await callback(page, context);
    assert.deepEqual(errors, []);
    result.push({ name, passed: true });
    console.log('PASS ' + name);
  } catch (error) {
    await mkdir('artifacts/browser', { recursive: true });
    await page.screenshot({ path: 'artifacts/browser/failure-' + result.length + '.png' }).catch(() => {});
    result.push({ name, passed: false, error: error.message });
    console.error('FAIL ' + name + ': ' + error.message);
  } finally { await context.close(); }
}
async function fillUser(page, name, firstName = 'Prueba') {
  await page.locator('#user-username').fill(name);
  await page.locator('#user-firstName').fill(firstName);
  await page.locator('#user-lastName').fill('Navegador');
  await page.locator('#user-email').fill(name + '@example.test');
  await page.locator('#user-password').fill(password);
  await page.locator('#user-confirm-password').fill(password);
}
const row = (page, name) => page.locator('.user-row').filter({ has: page.getByRole('heading', { name, exact: true }) });
try {
  await scenario('Rutas protegidas y error de login', async page => {
    for (const route of ['home', 'cart', 'index', 'desconocida']) {
      await navigate(page, route);
      await expect(page).toHaveURL(/\/login$/);
    }
    await expect(page.getByRole('button', { name: 'Ingresar', exact: true })).toBeDisabled();
    await page.locator('#login-username').fill('inexistente');
    await page.locator('#login-password').fill('incorrecta');
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Usuario o contraseña incorrectos');
    assert.equal(await page.evaluate(key => sessionStorage.getItem(key), tokenKey), null);
    await expect(page.getByRole('button', { name: 'Ingresar', exact: true })).toBeEnabled();
  });
  await scenario('Registro, duplicado y sesión en sessionStorage', async page => {
    const name = prefix + '_account';
    await navigate(page, 'register');
    await page.locator('#register-username').fill(name);
    await page.locator('#register-firstname').fill('Usuario');
    await page.locator('#register-lastname').fill('Nuevo');
    await page.locator('#register-email').fill(name + '@example.test');
    await page.locator('#register-password').fill(password);
    await page.locator('#register-confirm-password').fill(password);
    await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
    await expect(page).toHaveURL(/\/login\?registered=1$/);
    created.push(name);
    await loginReal(page, name, password);
    const saved = await page.evaluate(({ tokenKey, userKey }) => ({
      session: Boolean(sessionStorage.getItem(tokenKey)), local: localStorage.getItem(tokenKey),
      user: JSON.parse(sessionStorage.getItem(userKey)),
    }), { tokenKey, userKey });
    assert.equal(saved.session, true); assert.equal(saved.local, null);
    assert.equal(saved.user.username, name); assert.equal(saved.user.password, undefined);
    await page.reload(); await expect(row(page, name)).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await navigate(page, 'register');
    await page.locator('#register-username').fill(name);
    await page.locator('#register-firstname').fill('Usuario');
    await page.locator('#register-lastname').fill('Nuevo');
    await page.locator('#register-email').fill(name + '@example.test');
    await page.locator('#register-password').fill(password);
    await page.locator('#register-confirm-password').fill(password);
    await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('ya está registrado');
  });
  await scenario('CRUD completo y errores Axios preservan formulario y listado', async page => {
    await loginReal(page);
    const name = prefix + '_crud';
    await fillUser(page, name);
    await page.route('**/api/users', route => route.request().method() === 'POST'
      ? route.fulfill({ status: 503, json: { message: 'Fallo simulado de guardado' } }) : route.continue());
    await page.getByRole('button', { name: 'Crear usuario', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('No pudimos confirmar');
    await expect(page.locator('#user-username')).toHaveValue(name);
    await expect(row(page, name)).toHaveCount(0);
    await page.unroute('**/api/users');
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await page.getByRole('button', { name: 'Crear usuario', exact: true }).click();
    await expect(row(page, name)).toBeVisible(); created.push(name);
    await row(page, name).getByRole('button', { name: 'Editar ' + name, exact: true }).click();
    await page.locator('#user-firstName').fill('Actualizado');
    await expect(page.locator('#user-password')).toHaveValue('');
    await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect(row(page, name)).toContainText('Actualizado');
    await page.reload(); await expect(row(page, name)).toContainText('Actualizado');
    page.once('dialog', dialog => dialog.dismiss());
    await row(page, name).getByRole('button', { name: 'Eliminar ' + name, exact: true }).click();
    await expect(row(page, name)).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    await row(page, name).getByRole('button', { name: 'Eliminar ' + name, exact: true }).click();
    await expect(row(page, name)).toHaveCount(0);
    await page.reload(); await expect(row(page, name)).toHaveCount(0);
    // Esperar la consulta inicial antes de simular el error del siguiente refresco.
    await expect(page.getByTestId('users-cache-status')).toContainText('Última actualización');
    await expect(page.getByRole('button', { name: 'Actualizar', exact: true })).toBeEnabled();
    await page.route('**/api/users', route => route.fulfill({ status: 401, json: { message: 'Sesión vencida' } }));
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await expect(page).toHaveURL(/\/login\?expired=1$/);
    assert.equal(await page.evaluate(key => sessionStorage.getItem(key), tokenKey), null);
  });
  await scenario('Carrito persiste al cerrar pestaña y cambiar de sesión', async (page, context) => {
    const name = prefix + '_account';
    await loginReal(page, name, password);
    await page.getByRole('link', { name: 'Carrito', exact: true }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await page.getByRole('button', { name: 'Agregar Mouse inalámbrico', exact: true }).click();
    await page.getByRole('button', { name: 'Aumentar Mouse inalámbrico', exact: true }).click();
    await expect(page.getByTestId('quantity')).toHaveText('2');
    await page.reload(); await expect(page.getByTestId('quantity')).toHaveText('2');
    await page.close();
    const reopened = await context.newPage();
    await navigate(reopened, 'cart'); await expect(reopened).toHaveURL(/\/login$/);
    await loginReal(reopened, name, password);
    await reopened.getByRole('link', { name: 'Carrito', exact: true }).click();
    await expect(reopened.getByTestId('quantity')).toHaveText('2');
    await reopened.getByRole('button', { name: 'Quitar Mouse inalámbrico', exact: true }).click();
    await expect(reopened.getByText('Tu carrito está vacío.')).toBeVisible();
    await reopened.reload(); await expect(reopened.getByText('Tu carrito está vacío.')).toBeVisible();
    await reopened.getByRole('link', { name: 'Usuarios', exact: true }).click();
    await reopened.getByRole('button', { name: 'Cerrar sesión' }).click();
    await loginReal(reopened);
    await expect(reopened.getByRole('heading', { name: 'Hola, Emily' })).toBeVisible();
  });
  await scenario('Cuatro pantallas adaptables: 390, 768 y 1440 px', async page => {
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await navigate(page, 'login'); await assertNoOverflow(page, width);
      await navigate(page, 'register'); await assertNoOverflow(page, width);
      await loginReal(page); await assertNoOverflow(page, width);
      await page.getByRole('link', { name: 'Carrito', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Tu carrito', exact: true })).toBeVisible();
      await assertNoOverflow(page, width);
      await page.getByRole('link', { name: 'Usuarios', exact: true }).click();
      await page.getByRole('button', { name: 'Cerrar sesión' }).click();
      await expect(page).toHaveURL(/\/login$/);
    }
  });
} finally {
  // Limpieza mediante API únicamente de los usuarios creados por esta prueba.
  const apiBase = new URL('api/', baseURL).href;
  const auth = await fetch(apiBase + 'auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'emilys', password: 'emilyspass' }) }).then(r => r.json());
  const headers = { Authorization: 'Bearer ' + auth.accessToken };
  const data = await fetch(apiBase + 'users', { headers }).then(r => r.json());
  for (const user of data.users || []) if (created.includes(user.username)) await fetch(apiBase + 'users/' + user.id, { method: 'DELETE', headers });
  await fetch(apiBase + 'auth/logout', { method: 'POST', headers });
  await browser.close();
  await mkdir('artifacts/browser', { recursive: true });
  await writeFile('artifacts/browser/results.json', JSON.stringify({ at: new Date().toISOString(), baseURL, results: result }, null, 2));
}
if (result.some(item => !item.passed)) process.exitCode = 1;
