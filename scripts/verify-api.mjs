import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.API_URL || 'http://localhost/novacart/api';
const prefix = 'api_' + Date.now();
const records = [];
let adminToken;
let checks = 0;
async function request(route, method = 'GET', body, token) {
  const response = await fetch(base + route, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
function check(condition, label) { assert.ok(condition, label); checks++; console.log('PASS ' + label); }
function input(suffix) { return { username: prefix + suffix, firstName: 'Prueba', lastName: 'API', email: prefix + suffix + '@example.test', password: 'Test-password-123' }; }
const a = input('_a');
const b = input('_b');
try {
  const health = await request('/health');
  check(health.status === 200 && health.body.database === 'mysql', 'MySQL XAMPP conectado');
  check((await request('/users')).status === 401, 'Usuarios requieren autenticación');
  const created = await request('/auth/register', 'POST', a);
  check(created.status === 201 && created.body.username === a.username, 'Registro persistente');
  records.push(created.body.id);
  check(!JSON.stringify(created.body).includes('password'), 'Respuesta sin contraseña');
  check((await request('/auth/register', 'POST', a)).status === 409, 'Duplicados rechazados');
  check((await request('/auth/login', 'POST', { ...a, password: 'incorrecta' })).status === 401, 'Credenciales incorrectas rechazadas');
  const auth = await request('/auth/login', 'POST', a);
  const token = auth.body.accessToken;
  check(auth.status === 200 && /^[a-f0-9]{64}$/.test(token) && auth.body.expiresAt > Date.now() / 1000, 'Token temporal válido');
  check((await request('/users', 'POST', { ...b, username: "' OR 1=1 --" }, token)).status === 400, 'Validación de username');
  const second = await request('/users', 'POST', b, token);
  check(second.status === 201, 'Alta desde CRUD');
  records.push(second.body.id);
  const bId = second.body.id;
  const updated = await request('/users/' + bId, 'PUT', { ...b, firstName: 'Modificado', password: '' }, token);
  check(updated.status === 200 && updated.body.firstName === 'Modificado', 'Edición preserva contraseña vacía');
  const bAuth = await request('/auth/login', 'POST', b);
  check(bAuth.status === 200, 'Contraseña conservada sirve para autenticar');
  check((await request('/users/' + bId, 'GET', undefined, token)).body.firstName === 'Modificado', 'Datos leídos desde otra solicitud PHP');
  check((await request('/users/' + created.body.id, 'DELETE', undefined, token)).status === 409, 'No elimina cuenta activa');
  const products = await request('/products', 'GET', undefined, token);
  const product = products.body.products[0];
  const changed = await request('/cart/' + product.id, 'PUT', { quantity: 2, price: 0, userId: bId }, token);
  check(changed.status === 200 && changed.body.total === product.price * 2, 'Carrito usa precio y usuario del servidor');
  check((await request('/cart/' + product.id, 'PUT', { quantity: 1000 }, token)).status === 400, 'Stock y cantidad validados');
  check((await request('/cart', 'GET', undefined, bAuth.body.accessToken)).body.items.length === 0, 'Carritos aislados por cuenta');
  await request('/auth/logout', 'POST', {}, token);
  check((await request('/cart', 'GET', undefined, token)).status === 401, 'Logout revoca token');
  const loginAgain = await request('/auth/login', 'POST', a);
  const newToken = loginAgain.body.accessToken;
  const restored = await request('/cart', 'GET', undefined, newToken);
  check(restored.body.items[0].quantity === 2, 'Carrito persiste al cerrar e iniciar sesión');
  const cartRemoved = await request('/cart/' + product.id, 'DELETE', undefined, newToken);
  check(cartRemoved.body.items.length === 0, 'Eliminación de artículo');
  const newPassword = 'Different-password-456';
  await request('/users/' + bId, 'PUT', { ...b, password: newPassword }, newToken);
  check((await request('/auth/me', 'GET', undefined, bAuth.body.accessToken)).status === 401, 'Cambiar contraseña revoca sesiones');
  check((await request('/auth/login', 'POST', { username: b.username, password: newPassword })).status === 200, 'Nueva contraseña persistente');
  check((await request('/users/' + bId, 'DELETE', undefined, newToken)).status === 204, 'Baja de usuario');
  check((await request('/users/' + bId, 'GET', undefined, newToken)).status === 404, 'Usuario borrado no reaparece');
  await mkdir('artifacts/api', { recursive: true });
  await writeFile('artifacts/api/results.json', JSON.stringify({ at: new Date().toISOString(), checks, passed: true, database: 'mysql' }, null, 2));
  console.log(checks + ' comprobaciones API aprobadas.');
} finally {
  // Solo elimina los IDs creados por esta ejecución.
  const demo = await request('/auth/login', 'POST', { username: 'emilys', password: 'emilyspass' });
  adminToken = demo.body?.accessToken;
  if (adminToken) {
    for (const id of records) await request('/users/' + id, 'DELETE', undefined, adminToken);
    await request('/auth/logout', 'POST', {}, adminToken);
  }
}
