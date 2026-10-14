import { mkdir, writeFile } from 'node:fs/promises';
import { assert, expect, baseURL, tokenKey, launchBrowser, makePage, loginReal } from './browser-helpers.mjs';

// Evidencia real de la UI. Solo crea/modifica/elimina el usuario temporal de esta
// ejecución. Las demoras y el error 503 son simulaciones explícitas del transporte.
// No se registran cuerpos HTTP, cabeceras, contraseñas ni tokens.
const screenshotDirectory = 'docs/screenshots-rest';
const resultPath = 'docs/evidencia/rest-verificacion.json';
const apiBase = (process.env.API_URL || new URL('api/', baseURL).href).replace(/\/?$/, '/');
const username = 'rest_' + Date.now();
const password = 'Rest-demo-12345';
const failedUsername = username + '_error';
const report = {
  generatedAt: new Date().toISOString(),
  timezone: 'America/Mexico_City',
  baseURL,
  apiBase,
  passed: false,
  checks: [],
  requests: [],
  screenshots: [],
  simulations: [
    'GET y POST se retienen temporalmente en Playwright para capturar el loading; luego continúa la petición a la API real.',
    'Un POST recibe HTTP 503 simulado por Playwright; no llega al servidor y no crea registros.',
  ],
  cleanup: { completed: false, temporaryRecordsRemaining: null },
};
let browser;
let context;
let page;
let sessionToken;
let simulatedPost = false;
let abortHeldRequest = async () => {};
let temporaryId;
const pendingMutations = new Map();

function check(name, details = {}) {
  report.checks.push({ name, passed: true, ...details });
  console.log('PASS ' + name);
}

function responseFor(method, path = '/users') {
  const pending = page.waitForResponse(response => response.request().method() === method
    && new URL(response.url()).pathname.endsWith('/api' + path));
  // Si otra aserción falla primero, el cierre del navegador no deja un rechazo sin manejar.
  pending.catch(() => {});
  return pending;
}

function ownRow() {
  return page.locator('.user-row').filter({ has: page.getByRole('heading', { name: username, exact: true }) });
}

async function fillUser(name = username) {
  for (const [id, value] of Object.entries({
    username: name, firstName: 'Evidencia', lastName: 'REST',
    email: name + '@example.test', password, 'confirm-password': password,
  })) await page.locator('#user-' + id).fill(value);
}

async function screenshot(filename, description, mode = 'panel') {
  // Recortes de la UI real: sólo cambia el viewport/scroll, nunca el contenido.
  const path = screenshotDirectory + '/' + filename;
  if (mode === 'overview') {
    await page.screenshot({ path, animations: 'disabled' });
  } else if (mode === 'panel') {
    await page.locator('.users-panel').evaluate(element => element.scrollIntoView({ block: 'start' }));
    await page.locator('.users-panel').screenshot({ path, animations: 'disabled' });
  } else {
    await page.setViewportSize({ width: 900, height: 1180 });
    const first = mode === 'pending' ? '[data-testid="users-mutation-loading"]'
      : mode === 'error' ? '.connection-notice' : '.editor-panel';
    const last = mode === 'pending' ? '.users-panel'
      : mode === 'error' ? '.summary-grid' : '#user-email';
    await page.locator(first).evaluate(element => element.scrollIntoView({ block: 'start' }));
    await page.locator('app-home:not(.ion-page-hidden) ion-content').evaluate(async element => {
      (await element.getScrollElement()).scrollTop -= 16;
    });
    const start = await page.locator(first).boundingBox();
    const end = await page.locator(last).boundingBox();
    const clip = {
      x: Math.floor(start.x), y: Math.floor(start.y - 8), width: Math.ceil(start.width),
      height: Math.ceil(end.y + end.height - start.y + 12),
    };
    assert.ok(clip.y >= 0 && clip.y + clip.height <= 1180, 'El recorte cabe en el viewport');
    await page.screenshot({ path, clip, animations: 'disabled' });
    await page.setViewportSize({ width: 1440, height: 1180 });
  }
  report.screenshots.push({ path, description, capture: mode === 'overview' ? 'viewport completo' : 'recorte de interfaz sin modificar contenido' });
}

async function holdUsersRequest(method) {
  let release;
  let complete;
  let aborted = false;
  let started = false;
  const held = new Promise(resolve => { release = resolve; });
  const handled = new Promise(resolve => { complete = resolve; });
  const timer = setTimeout(release, 10000);
  const handler = async route => {
    if (route.request().method() === method) {
      started = true;
      await held;
      try { if (aborted) await route.abort('failed'); else await route.continue(); }
      finally { complete(); }
    } else await route.continue();
  };
  await page.route('**/api/users', handler);
  abortHeldRequest = async () => {
    aborted = true;
    clearTimeout(timer);
    release();
    if (started) await handled;
    await page.unroute('**/api/users', handler);
    abortHeldRequest = async () => {};
  };
  return async () => {
    clearTimeout(timer);
    release();
    await handled;
    await page.unroute('**/api/users', handler);
    abortHeldRequest = async () => {};
  };
}

async function waitForReady() {
  await expect(page.getByRole('button', { name: 'Actualizar', exact: true })).toBeEnabled();
  await expect(page.locator('.users-panel')).toHaveAttribute('aria-busy', 'false');
}

async function authenticatedRequest(path, method = 'GET') {
  const response = await fetch(apiBase + path, {
    method, headers: { Accept: 'application/json', Authorization: 'Bearer ' + sessionToken },
  });
  const raw = await response.text();
  return { status: response.status, data: raw ? JSON.parse(raw) : null };
}

await mkdir(screenshotDirectory, { recursive: true });
await mkdir('docs/evidencia', { recursive: true });
try {
  const healthResponse = await fetch(apiBase + 'health');
  assert.equal(healthResponse.status, 200);
  const health = await healthResponse.json();
  report.database = health.database;
  check('La API real responde al diagnóstico', { httpStatus: healthResponse.status, database: health.database });

  browser = await launchBrowser();
  const state = await makePage(browser, { viewport: { width: 1440, height: 1180 }, timezoneId: 'America/Mexico_City', serviceWorkers: 'block' });
  ({ context, page } = state);
  page.on('request', request => {
    if (!/\/api\/users(?:\/\d+)?$/.test(new URL(request.url()).pathname)
      || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) return;
    let resolve;
    const completion = new Promise(done => { resolve = done; });
    pendingMutations.set(request, { completion, resolve });
  });
  const finishRequest = request => {
    pendingMutations.get(request)?.resolve();
    pendingMutations.delete(request);
  };
  page.on('requestfinished', finishRequest);
  page.on('requestfailed', finishRequest);
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (!/\/api\/users(?:\/\d+)?$/.test(path)) return;
    report.requests.push({
      method: response.request().method(), path, status: response.status(),
      simulated: simulatedPost && response.request().method() === 'POST' && response.status() === 503,
    });
  });
  await loginReal(page);
  await expect(page.locator('app-login:not(.ion-page-hidden)')).toHaveCount(0);
  sessionToken = await page.evaluate(key => sessionStorage.getItem(key), tokenKey);
  assert.ok(sessionToken);
  await waitForReady();
  check('Inicio de sesión con la cuenta demo existente');
  await page.locator('#input-search-users').fill('emilys');
  await screenshot('00-vista-general.png', 'Vista general de la aplicación Ionic con búsqueda de la cuenta demo; no muestra datos personales de otras cuentas.', 'overview');

  let release = await holdUsersRequest('GET');
  const getResponse = responseFor('GET');
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cargando usuarios…', exact: true })).toBeVisible();
  await expect(page.locator('.users-panel')).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByTestId('users-request-loading').locator('ion-spinner')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Actualizar', exact: true })).toBeDisabled();
  await expect(page.locator('#user-username')).toBeDisabled();
  await screenshot('01-loading-get.png', 'GET pendiente: indicador de carga visible y acciones deshabilitadas. Demora controlada; respuesta real.');
  check('Loading durante GET y bloqueo de acciones', { simulation: 'demora del transporte' });
  await release();
  assert.equal((await getResponse).status(), 200);
  await waitForReady();
  await expect(page.locator('.user-row').first()).toBeVisible();
  await screenshot('02-get-usuarios.png', 'GET /users devuelve HTTP 200; el directorio muestra usuarios recuperados de la API real.');
  check('GET /users actualiza el listado', { httpStatus: 200 });

  await page.locator('#input-search-users').fill(username);
  await fillUser();
  release = await holdUsersRequest('POST');
  const postResponse = responseFor('POST');
  await page.getByRole('button', { name: 'Crear usuario', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Guardando…', exact: true })).toBeDisabled();
  await expect(page.locator('.editor-panel form')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#user-username')).toBeDisabled();
  await expect(page.getByTestId('users-mutation-loading').locator('ion-spinner')).toBeVisible();
  await screenshot('03-loading-post.png', 'POST pendiente: Procesando solicitud… con spinner y Actualizar deshabilitado. El script también comprueba Guardando… y el bloqueo del formulario. Demora controlada; respuesta real.', 'pending');
  check('Loading durante POST y prevención de doble envío', { simulation: 'demora del transporte' });
  await release();
  const createdResponse = await postResponse;
  assert.equal(createdResponse.status(), 201);
  temporaryId = (await createdResponse.json()).id;
  assert.ok(Number.isInteger(temporaryId));
  await expect(ownRow()).toBeVisible();
  await expect(page.locator('.form-success')).toHaveText('Usuario creado.');
  await waitForReady();
  await screenshot('04-post-creado.png', 'POST /users devuelve HTTP 201; el usuario temporal aparece en el directorio y se confirma la creación.');
  check('POST /users crea un usuario temporal', { httpStatus: 201 });

  await fillUser();
  const conflictResponse = responseFor('POST');
  await page.getByRole('button', { name: 'Crear usuario', exact: true }).click();
  assert.equal((await conflictResponse).status(), 409);
  await expect(page.getByRole('alert')).toContainText('ya está registrado');
  await expect(page.locator('#user-username')).toHaveValue(username);
  await expect(ownRow()).toHaveCount(1);
  await screenshot('09-error-409-real.png', 'HTTP 409 real de la API al intentar duplicar el usuario temporal: el aviso explica el conflicto.', 'error');
  check('Error HTTP 409 real: informa duplicado y conserva el formulario', { httpStatus: 409 });

  await ownRow().getByRole('button', { name: 'Editar ' + username, exact: true }).click();
  await expect(page.locator('#user-password')).toHaveValue('');
  await page.locator('#user-firstName').fill('Actualizado');
  const putResponse = responseFor('PUT', '/users/' + temporaryId);
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  assert.equal((await putResponse).status(), 200);
  await expect(ownRow()).toContainText('Actualizado REST');
  await expect(page.locator('.form-success')).toHaveText('Usuario actualizado.');
  await waitForReady();
  await screenshot('05-put-actualizado.png', 'PUT /users/:id devuelve HTTP 200 y confirma el nombre Actualizado REST.');
  await page.reload();
  await waitForReady();
  await page.locator('#input-search-users').fill(username);
  await expect(ownRow()).toContainText('Actualizado REST');
  check('PUT /users/:id actualiza y persiste después de recargar', { httpStatus: 200 });

  const deleteResponse = responseFor('DELETE', '/users/' + temporaryId);
  page.once('dialog', dialog => dialog.accept());
  await ownRow().getByRole('button', { name: 'Eliminar ' + username, exact: true }).click();
  assert.equal((await deleteResponse).status(), 204);
  await expect(ownRow()).toHaveCount(0);
  await expect(page.locator('.form-success')).toHaveText('Usuario eliminado.');
  await waitForReady();
  await screenshot('06-delete-eliminado.png', 'DELETE /users/:id devuelve HTTP 204; mensaje de eliminación y búsqueda sin coincidencias.');
  await page.reload();
  await waitForReady();
  await page.locator('#input-search-users').fill(username);
  await expect(ownRow()).toHaveCount(0);
  assert.equal((await authenticatedRequest('users/' + temporaryId)).status, 404);
  check('DELETE /users/:id elimina y no reaparece después de recargar', { httpStatus: 204, subsequentGetStatus: 404 });

  await fillUser(failedUsername);
  simulatedPost = true;
  const failPost = route => route.request().method() === 'POST'
    ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Fallo 503 simulado para evidencia REST' }) })
    : route.continue();
  await page.route('**/api/users', failPost);
  const failureResponse = responseFor('POST');
  await page.getByRole('button', { name: 'Crear usuario', exact: true }).click();
  assert.equal((await failureResponse).status(), 503);
  await expect(page.getByRole('alert')).toContainText('No pudimos confirmar');
  await expect(page.locator('#user-username')).toHaveValue(failedUsername);
  await expect(page.getByRole('button', { name: 'Crear usuario', exact: true })).toBeDisabled();
  await screenshot('07-error-controlado.png', 'HTTP 503 simulado en navegador: aviso comprensible y estado Actualización pendiente; la comprobación confirma datos conservados y bloqueo del reenvío.', 'error');
  check('Error HTTP 503 simulado: conserva datos y exige actualizar antes de reintentar', { httpStatus: 503, simulated: true });
  await page.unroute('**/api/users', failPost);
  simulatedPost = false;
  const recoveryResponse = responseFor('GET');
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
  assert.equal((await recoveryResponse).status(), 200);
  await waitForReady();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Crear usuario', exact: true })).toBeEnabled();
  await expect(page.locator('#user-username')).toHaveValue(failedUsername);
  await screenshot('08-recuperacion.png', 'GET real restaura el servicio tras retirar la simulación; desaparece el error y el formulario conserva los datos.', 'fields');
  check('Recuperación: GET real habilita nuevamente el formulario', { httpStatus: 200 });
  assert.deepEqual(state.errors, []);
  check('Sin errores JavaScript no controlados');
  report.passed = true;
} catch (error) {
  // Evita que incluso un mensaje de fallo de la automatización publique secretos.
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of [sessionToken, password, 'emilyspass'].filter(Boolean)) message = message.replaceAll(secret, '[REDACTADO]');
  report.checks.push({ name: 'Verificación interrumpida', passed: false, error: message });
  console.error('FAIL ' + message);
  process.exitCode = 1;
} finally {
  // Ante un fallo cancela la escritura aún retenida sin enviarla a la API.
  // Las escrituras ya enviadas terminan antes de comprobar y limpiar registros.
  await abortHeldRequest();
  if (page) await page.unrouteAll({ behavior: 'wait' }).catch(() => {});
  await Promise.all([...pendingMutations.values()].map(item => item.completion));
  try {
    if (sessionToken) {
      const listing = await authenticatedRequest('users');
      assert.equal(listing.status, 200);
      // Nombres únicos de esta ejecución: jamás borra usuarios previos.
      const owned = (listing.data.users || []).filter(user => [username, failedUsername].includes(user.username));
      for (const user of owned) {
        assert.equal((await authenticatedRequest('users/' + user.id, 'DELETE')).status, 204);
      }
      const finalListing = await authenticatedRequest('users');
      assert.equal(finalListing.status, 200);
      const remaining = finalListing.data.users.filter(user => [username, failedUsername].includes(user.username)).length;
      assert.equal(remaining, 0);
      report.cleanup = { completed: true, temporaryRecordsRemaining: remaining, recordsRemovedDuringCleanup: owned.length };
      await authenticatedRequest('auth/logout', 'POST');
    } else {
      report.cleanup = { completed: true, temporaryRecordsRemaining: 0, recordsRemovedDuringCleanup: 0, note: 'No se inició sesión ni se crearon registros.' };
    }
  } catch {
    report.cleanup = { completed: false, temporaryRecordsRemaining: null, note: 'No fue posible verificar la limpieza; revisar exclusivamente los nombres temporales de esta ejecución.', temporaryUsernames: [username, failedUsername] };
    report.passed = false;
    process.exitCode = 1;
  }
  if (context) await context.close();
  if (browser) await browser.close();
  await writeFile(resultPath, JSON.stringify(report, null, 2) + '\n');
}
console.log(`${report.checks.filter(item => item.passed).length} comprobaciones; ${report.screenshots.length} capturas. Resultado: ${resultPath}`);
