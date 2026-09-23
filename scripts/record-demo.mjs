import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { baseURL, launchBrowser, makePage, navigate, loginReal, expect } from './browser-helpers.mjs';
const name = 'video_' + Date.now();
const child = name + '_crud';
const password = 'Demo-video-123';
const clips = [];
const api = new URL('api/', baseURL).href;
await mkdir('artifacts/video', { recursive: true });
await mkdir('docs/videos', { recursive: true });
let browser;
async function videoPage() {
  browser = await launchBrowser();
  const state = await makePage(browser, { viewport: { width: 1280, height: 900 },
    recordVideo: { dir: 'artifacts/video', size: { width: 1280, height: 900 } } });
  await state.page.addInitScript(() => {
    addEventListener('DOMContentLoaded', () => {
      const label = document.createElement('div');
      label.id = 'demo-caption';
      label.style.cssText = 'position:fixed;bottom:18px;left:18px;right:18px;z-index:999999;background:#29223feF;color:white;border-radius:12px;padding:14px 20px;font:600 20px Arial;pointer-events:none;box-shadow:0 3px 20px #0002';
      document.body.appendChild(label);
    });
  });
  return state;
}
async function caption(page, text) {
  await page.locator('#demo-caption').evaluate((el, value) => { el.textContent = value; }, text);
  await page.waitForTimeout(1700);
}
async function closeClip(state) {
  const video = state.page.video();
  await state.context.close();
  clips.push(await video.path());
  await browser.close();
}
try {
  let state = await videoPage();
  let page = state.page;
  await navigate(page, 'register');
  await caption(page, '1. Registro de una cuenta en MySQL (XAMPP)');
  for (const [id, value] of Object.entries({ username: name, firstname: 'Demo', lastname: 'MySQL', email: name + '@example.test', password })) {
    await page.locator('#register-' + id).fill(value);
  }
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?registered=1$/);
  await caption(page, '2. Login: Axios autentica y guarda la sesión');
  await loginReal(page, name, password);
  await caption(page, '3. Alta de otro usuario desde la página principal');
  for (const [id, value] of Object.entries({ username: child, firstName: 'Nombre inicial', lastName: 'Prueba', email: child + '@example.test', password })) {
    await page.locator('#user-' + id).fill(value);
  }
  await page.getByRole('button', { name: 'Crear usuario', exact: true }).click();
  await expect(page.getByRole('heading', { name: child, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Editar ' + child, exact: true }).click();
  await page.locator('#user-firstName').fill('Nombre persistente');
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(page.getByText('Nombre persistente Prueba', { exact: true })).toBeVisible();
  await caption(page, '4. Modificación guardada: Nombre persistente');
  await page.getByRole('link', { name: 'Carrito', exact: true }).click();
  await page.getByRole('button', { name: 'Agregar Mouse inalámbrico', exact: true }).click();
  await page.getByRole('button', { name: 'Aumentar Mouse inalámbrico', exact: true }).click();
  await expect(page.getByTestId('quantity')).toHaveText('2');
  await caption(page, '5. Carrito guardado: 2 artículos. Cerramos el navegador.');
  await closeClip(state);

  state = await videoPage(); page = state.page;
  await navigate(page, 'home');
  await expect(page).toHaveURL(/\/login$/);
  await caption(page, '6. Navegador nuevo: la sesión terminó, MySQL conserva los datos');
  await loginReal(page, name, password);
  await expect(page.getByText('Nombre persistente Prueba', { exact: true })).toBeVisible();
  await caption(page, '7. El usuario y su modificación siguen guardados');
  await page.getByRole('link', { name: 'Carrito', exact: true }).click();
  await expect(page.getByTestId('quantity')).toHaveText('2');
  await caption(page, '8. El carrito recupera las mismas 2 unidades');
  await page.getByRole('button', { name: 'Quitar Mouse inalámbrico', exact: true }).click();
  await expect(page.getByText('Tu carrito está vacío.')).toBeVisible();
  await page.getByRole('link', { name: 'Usuarios', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Eliminar ' + child, exact: true }).click();
  await expect(page.getByRole('heading', { name: child, exact: true })).toHaveCount(0);
  await page.reload();
  await caption(page, '9. Eliminación persistente: el usuario borrado no reaparece');
  await closeClip(state);
  const list = clips.map(p => "file '" + p.replaceAll('\\', '/') + "'").join('\n');
  await writeFile('artifacts/video/clips.txt', list);
  const probe = spawnSync('python', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8', windowsHide: true });
  const ffmpeg = process.env.FFMPEG_BIN || probe.stdout.trim();
  if (!ffmpeg) throw new Error('Instala imageio-ffmpeg con pip o configura FFMPEG_BIN.');
  const joined = spawnSync(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', 'artifacts/video/clips.txt', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', 'docs/videos/novacart-mysql.mp4'], { windowsHide: true, encoding: 'utf8' });
  if (joined.error || joined.status !== 0) throw new Error('No se pudo unir el video: ' + joined.stderr);
  console.log('Video real: docs/videos/novacart-mysql.mp4');
} finally {
  if (browser?.isConnected()) await browser.close();
  const auth = await fetch(api + 'auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'emilys', password: 'emilyspass' }) }).then(r => r.json());
  const headers = { Authorization: 'Bearer ' + auth.accessToken };
  const users = await fetch(api + 'users', { headers }).then(r => r.json());
  for (const user of users.users || []) if ([name, child].includes(user.username)) await fetch(api + 'users/' + user.id, { method: 'DELETE', headers });
  await fetch(api + 'auth/logout', { method: 'POST', headers });
}
