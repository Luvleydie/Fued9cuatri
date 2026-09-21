import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { assertNoRuntimeErrors, expect, launchBrowser, loginReal, makePage, navigate, waitForImages } from './browser-helpers.mjs';

// Evidencias de una sesión y API reales. Este script nunca intercepta peticiones.
const destination = path.resolve('docs/screenshots');
await mkdir(destination, { recursive: true });
const browser = await launchBrowser();
const { context, page, diagnostics } = await makePage(browser);
// Altura suficiente para que las acciones de la primera fila queden completas.
await page.setViewportSize({ width: 1440, height: 1200 });
const saved = [];

async function capture(filename) {
  await waitForImages(page);
  await page.screenshot({ path: path.join(destination, filename), fullPage: false, animations: 'disabled' });
  saved.push(filename);
}

try {
  await navigate(page, '/login');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await capture('01-login.png');

  await loginReal(page);
  await capture('02-products.png');

  await navigate(page, '/product/1');
  await expect(page.getByRole('heading', { name: 'Essence Mascara Lash Princess' })).toBeVisible();
  await expect(page.getByText('Producto del catálogo de respaldo.', { exact: true })).toHaveCount(0);
  await capture('03-product-detail.png');
  await page.getByRole('button', { name: 'Agregar al carrito', exact: true }).click();
  await page.getByRole('button', { name: 'Agregar al carrito', exact: true }).click();
  await navigate(page, '/product/6');
  await expect(page.getByRole('heading', { name: 'Calvin Klein CK One' })).toBeVisible();
  await page.getByRole('button', { name: 'Agregar al carrito', exact: true }).click();

  await navigate(page, '/cart');
  await expect(page.locator('.cart-item:visible')).toHaveCount(2);
  await capture('04-cart.png');

  const profileResponse = page.waitForResponse((response) => response.url().endsWith('/auth/me'));
  await navigate(page, '/profile');
  const response = await profileResponse;
  if (response.status() !== 200) throw new Error(`El perfil real respondió HTTP ${response.status()}`);
  await expect(page.getByText('emilys', { exact: true })).toBeVisible();
  await expect(page.locator('.profile-loading:visible')).toHaveCount(0);
  await capture('05-profile.png');
  await navigate(page, '/inventory');
  await expect(page.locator('.inventory-product').first()).toBeVisible();
  await capture('06-inventory.png');
  await page.getByRole('button', { name: 'Editar Essence Mascara Lash Princess', exact: true }).click();
  await expect(page.locator('#product-title')).toBeVisible();
  await capture('07-product-form.png');
  assertNoRuntimeErrors(diagnostics);
  console.log(JSON.stringify({ source: 'API NovaCart y SQLite reales, sin mocks', viewport: '1440x1200', screenshots: saved }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
