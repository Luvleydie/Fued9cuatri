import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
export { assert, expect };
export const baseURL = (process.env.BASE_URL || 'http://localhost/novacart/').replace(/\/?$/, '/');
export const tokenKey = 'novacart.accessToken';
export const userKey = 'novacart.user';
export async function launchBrowser() {
  try { return await chromium.launch({ headless: true, channel: process.env.CHROME_CHANNEL || 'chrome' }); }
  catch { return chromium.launch({ headless: true }); }
}
export async function makePage(browser, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-MX', ...options });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  return { context, page, errors };
}
export async function navigate(page, route) { await page.goto(new URL(route.replace(/^\//, ''), baseURL).href); }
export async function loginReal(page, username = 'emilys', password = 'emilyspass') {
  await navigate(page, 'login');
  await page.locator('#login-username').fill(username);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.locator('.user-row').first()).toBeVisible();
}
export async function assertNoOverflow(page, width) {
  const overflow = await page.evaluate(async () => {
    const results = [document.documentElement.scrollWidth > innerWidth + 1];
    for (const el of document.querySelectorAll('ion-content')) {
      if (el.closest('.ion-page-hidden')) continue;
      const scroller = await el.getScrollElement();
      results.push(scroller.scrollWidth > scroller.clientWidth + 1);
    }
    return results.some(Boolean);
  });
  assert.equal(overflow, false, 'Sin desbordamiento a ' + width + 'px');
}
