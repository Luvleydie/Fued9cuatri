import { mkdir } from 'node:fs/promises';
import { launchBrowser, makePage, navigate, loginReal, expect, assertNoOverflow } from './browser-helpers.mjs';
await mkdir('docs/screenshots-simple', { recursive: true });
const browser = await launchBrowser();
try {
  for (const width of [1440, 390]) {
    const { context, page } = await makePage(browser, { viewport: { width, height: 1000 } });
    for (const [name, route] of [['01-login', 'login'], ['02-register', 'register']]) {
      await navigate(page, route);
      await expect(page.locator('h1')).toBeVisible();
      await assertNoOverflow(page, width);
      await page.waitForTimeout(700);
      await page.screenshot({ path: 'docs/screenshots-simple/' + name + '-' + width + '.png' });
    }
    await loginReal(page);
    await page.waitForTimeout(700);
    await page.screenshot({ path: 'docs/screenshots-simple/03-home-' + width + '.png' });
    await page.getByRole('link', { name: 'Carrito', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Productos', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Agregar Mouse inalámbrico', exact: true })).toBeVisible();
    await assertNoOverflow(page, width);
    await page.waitForTimeout(700);
    await page.screenshot({ path: 'docs/screenshots-simple/04-cart-' + width + '.png' });
    await context.close();
  }
} finally { await browser.close(); }
console.log('8 capturas de las cuatro pantallas, escritorio y móvil.');
