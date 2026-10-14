import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { assert, expect, baseURL, launchBrowser, makePage, loginReal, navigate, assertNoOverflow } from './browser-helpers.mjs';

const apiUrl = new URL('api/', baseURL).href;
const username = 'list_' + Date.now();
const credentials = { username, password: 'Lista-prueba-123' };
let createdUser;
let browser;
const checks = [];
async function request(route, method = 'GET', body, token) {
  const response = await fetch(apiUrl + route, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

try {
  const registration = await request('auth/register', 'POST', { ...credentials, firstName: 'Prueba', lastName: 'Lista', email: username + '@example.test' });
  assert.equal(registration.status, 201);
  createdUser = registration.body.id;
  browser = await launchBrowser();
  const { context, page, errors } = await makePage(browser, { permissions: ['clipboard-read', 'clipboard-write'] });
  await mkdir('artifacts/shopping-list', { recursive: true });
  await loginReal(page, credentials.username, credentials.password);
  await navigate(page, 'cart');
  const listButton = page.getByTestId('shopping-list');
  await expect(page.getByRole('heading', { name: 'Tu carrito está vacío.' })).toBeVisible();
  await expect(listButton).toBeDisabled();
  checks.push('El carrito vacío no exporta una lista.');
  const add = page.locator('.product-card button:enabled').first();
  await add.click();
  const item = page.locator('.cart-item').first();
  await expect(item).toBeVisible();
  const title = await item.locator('h3').innerText();
  await page.getByRole('button', { name: 'Aumentar ' + title, exact: true }).click();
  await expect(item.getByTestId('quantity')).toHaveText('2');
  await item.locator('input[type=number]').fill('9');
  await listButton.click();
  const text = page.locator('#shopping-list-text');
  await expect(text).toBeVisible();
  const contents = await text.inputValue();
  assert.ok(contents.includes(title) && contents.includes('Cantidad: 2'));
  assert.ok(!contents.includes('Cantidad: 9'));
  checks.push('La lista conserva cantidades confirmadas y excluye borradores.');
  await page.getByRole('button', { name: 'Copiar lista', exact: true }).click();
  await expect(page.locator('#shopping-list-copy-status')).toContainText('Lista copiada');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(copied.replace(/\r\n/g, '\n'), contents.replace(/^\uFEFF/, ''));
  const downloadReady = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar TXT', exact: true }).click();
  const download = await downloadReady;
  const downloadPath = await download.path();
  const downloadedText = await readFile(downloadPath, 'utf8');
  assert.ok(downloadedText.startsWith('\uFEFF'));
  assert.equal(downloadedText.replace(/\r\n/g, '\n'), contents);
  assert.match(download.suggestedFilename(), /^novacart-lista-\d{4}-\d{2}-\d{2}\.txt$/);
  checks.push('Copia al portapapeles y descarga TXT UTF-8 verificadas.');
  for (const width of [1440, 390, 360]) {
    await page.setViewportSize({ width, height: width > 600 ? 1000 : 844 });
    await assertNoOverflow(page, width);
    await page.screenshot({ path: `artifacts/shopping-list/modal-${width}.png` });
  }
  await page.getByRole('button', { name: 'Cerrar lista de compra', exact: true }).click();
  await expect(text).not.toBeVisible();
  for (const width of [360, 390, 1440]) {
    await page.setViewportSize({ width, height: width > 600 ? 1000 : 844 });
    await listButton.scrollIntoViewIfNeeded();
    await assertNoOverflow(page, width);
    await page.screenshot({ path: `artifacts/shopping-list/cart-${width}.png` });
  }
  checks.push('Carrito y modal sin desbordamiento en 360, 390 y 1440 px.');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await expect(page.getByTestId('cart-cache-status')).toContainText('copia temporal');
  await listButton.click();
  await expect(text).toBeVisible();
  const offlineContents = await text.inputValue();
  assert.ok(offlineContents.includes('Origen: copia temporal local'));
  assert.ok(offlineContents.includes('pueden estar desactualizados'));
  checks.push('Exportación offline identifica copia temporal y fecha.');
  await context.setOffline(false);
  assert.deepEqual(errors, []);
  await writeFile('artifacts/shopping-list/results.json', JSON.stringify({ at: new Date().toISOString(), passed: true, checks }, null, 2));
  console.log(checks.map(check => 'PASS ' + check).join('\n'));
} finally {
  if (browser) await browser.close();
  if (createdUser) {
    const auth = await request('auth/login', 'POST', { username: 'emilys', password: 'emilyspass' });
    assert.equal(auth.status, 200, 'La cuenta demo permite limpiar solo la cuenta temporal de esta prueba.');
    try { assert.equal((await request('users/' + createdUser, 'DELETE', undefined, auth.body.accessToken)).status, 204); }
    finally { await request('auth/logout', 'POST', {}, auth.body.accessToken); }
  }
}
