import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

export const baseURL = process.env.BASE_URL || 'http://localhost:8100';
export const tokenKey = 'novacart.accessToken';
export const userKey = 'novacart.user';
export const cartKey = 'novacart.cart';
export { expect, assert };

export async function launchBrowser() {
  const channel = process.env.CHROME_CHANNEL ?? 'chrome';
  try {
    return await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
  } catch (error) {
    if (process.env.CHROME_CHANNEL !== undefined) throw error;
    return chromium.launch({ headless: true });
  }
}

export async function makePage(browser, storageState) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: 'es-MX', ...(storageState ? { storageState } : {}) });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(30000);
  const diagnostics = { pageErrors: [], consoleErrors: [] };
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
  page.on('console', (message) => {
    // Las pruebas de fallos producen errores HTTP/red esperados del navegador.
    // Siempre se consideran fallos los errores JavaScript de la aplicación.
    if (message.type() === 'error' && !/^Failed to load resource:/.test(message.text())) diagnostics.consoleErrors.push(message.text());
  });
  return { context, page, diagnostics };
}

export function assertNoRuntimeErrors(diagnostics) {
  assert.deepEqual(diagnostics.pageErrors, [], 'Errores JavaScript no controlados');
  assert.deepEqual(diagnostics.consoleErrors, [], 'Errores de consola de la aplicación');
}

export async function navigate(page, path) {
  await page.goto(new URL(path, baseURL).href, { waitUntil: 'domcontentloaded' });
}

export async function loginReal(page) {
  await navigate(page, '/login');
  await page.getByRole('button', { name: 'Usar cuenta de demostración' }).click();
  const loginResponse = page.waitForResponse((response) => response.url().endsWith('/auth/login') && response.request().method() === 'POST');
  await page.getByRole('button', { name: /^Ingresar/ }).click();
  const response = await loginResponse;
  assert.equal(response.status(), 200, 'La API de NovaCart debe aceptar las credenciales de demostración');
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.locator('.product-card:visible').first()).toBeVisible();
  await expect(page.getByText('Estás viendo el catálogo de respaldo.', { exact: true })).toHaveCount(0);
}

export async function waitForImages(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const images = [...document.images].filter((img) => {
      const rect = img.getBoundingClientRect();
      return rect.width && rect.height && rect.top < innerHeight && rect.bottom > 0;
    });
    await Promise.all(images.map((img) => img.complete ? Promise.resolve() : new Promise((resolve) => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
      setTimeout(resolve, 10000);
    })));
  });
  await page.waitForTimeout(500); // Terminar animaciones de entrada de Ionic.
}

export async function assertNoOverflow(page, width) {
  const measurements = await page.evaluate(async () => {
    const roots = [{ name: 'document', scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }];
    for (const content of document.querySelectorAll('ion-content')) {
      if (!content.getBoundingClientRect().width || content.closest('.ion-page-hidden')) continue;
      const scroller = await content.getScrollElement();
      roots.push({ name: 'ion-content', scroll: scroller.scrollWidth, client: scroller.clientWidth });
    }
    return roots;
  });
  for (const result of measurements) assert.ok(result.scroll <= result.client + 1, `Desbordamiento a ${width}px en ${result.name}: ${result.scroll} > ${result.client}`);
  return measurements;
}
