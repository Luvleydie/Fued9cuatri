# APIs separadas: abrir, leer y probar

La **API** es el conjunto de operaciones HTTP de NovaCart. Cada operación (endpoint) combina una ruta y un método, por ejemplo `POST /auth/login`. El archivo PHP es la implementación de esa operación.

Base real en Apache: **http://localhost/novacart/api**.

| Función | Implementación PHP | Ejemplos de peticiones |
|---|---|---|
| Login | [login.php](../../server/endpoints/login.php) | [login.http](login.http) |
| Registro | [register.php](../../server/endpoints/register.php) | [register.http](register.http) |
| Sesión: perfil y salida | [session.php](../../server/endpoints/session.php) | [login.http](login.http) |
| CRUD de usuarios | [users.php](../../server/endpoints/users.php) | [users.http](users.http) |
| Productos del carrito | [products.php](../../server/endpoints/products.php) | [cart.http](cart.http) |
| Carrito | [cart.php](../../server/endpoints/cart.php) | [cart.http](cart.http) |

## Cómo leer un archivo .http

```http
PUT http://localhost/novacart/api/cart/1
Authorization: Bearer <token del login>
Content-Type: application/json

{ "quantity": 2 }
```

- **PUT** solicita asignar una cantidad.
- **/cart/1** identifica el producto 1.
- **Authorization** lleva el token que permite identificar al usuario.
- **Content-Type** indica que el cuerpo está escrito como JSON.
- **quantity** es el dato que recibe PHP y valida antes de escribir en MySQL.

Respuesta de ejemplo, si el producto 1 es el Mouse inicial:

```json
{
  "items": [
    { "productId": 1, "title": "Mouse inalámbrico", "price": 249, "stock": 20, "quantity": 2 }
  ],
  "total": 498
}
```

En Axios este JSON se encuentra en `response.data`; la respuesta HTTP completa también tiene `status` y `headers`. [Referencia de Axios](https://axios-http.com/docs/res_schema).

## Cómo ejecutar las peticiones

Los archivos se pueden leer sin herramientas adicionales. Para ejecutarlos en VS Code, se puede usar REST Client y su botón **Send Request**; también se pueden copiar método, URL, encabezados y JSON a Postman.

1. Enciende Apache y MySQL.
2. Abre un archivo .http.
3. Ejecuta las peticiones de arriba hacia abajo, una por una.
4. El bloque `# @name login` conserva la respuesta; `{{login.response.body.$.accessToken}}` reutiliza el token dentro del mismo archivo.
5. Los nombres de ejemplo del registro y CRUD se pueden cambiar en la variable username. Repetir un alta con el mismo username produce 409.
6. PUT y DELETE escriben datos de la cuenta usada. Para practicar con el carrito, cambia las credenciales iniciales por las de una cuenta de práctica.

No se abre `/api/endpoints/login.php` en el navegador. Los archivos internos están protegidos; la entrada pública es `/api/auth/login`. [index.php](../../server/index.php) dirige la ruta a su archivo.

## Métodos, datos y respuestas

Las rutas de esta tabla se agregan a la base `http://localhost/novacart/api`.

| Método y ruta | Cuerpo | Respuesta correcta |
|---|---|---|
| POST /auth/register | username, firstName, lastName, email, password | 201: User sin contraseña |
| POST /auth/login | username, password | 200: User + accessToken + expiresAt |
| GET /auth/me | Sin cuerpo | 200: User conectado |
| POST /auth/logout | Sin cuerpo | 204: sin cuerpo |
| GET /users | Sin cuerpo | 200: { users: User[] } |
| GET /users/:id | Sin cuerpo | 200: User |
| POST /users | UserInput | 201: User |
| PUT /users/:id | UserInput, contraseña opcional | 200: User actualizado |
| DELETE /users/:id | Sin cuerpo | 204: sin cuerpo |
| GET /products | Sin cuerpo | 200: { products: Product[] } |
| GET /cart | Sin cuerpo | 200: CartResponse |
| DELETE /cart | Sin cuerpo | 200: { items: [], total: 0 } de la cuenta autenticada |
| PUT /cart/:productId | { quantity: entero } | 200: CartResponse actualizado |
| DELETE /cart/:productId | Sin cuerpo | 200: CartResponse actualizado |

`DELETE /cart` vacía únicamente el carrito de la sesión que envía el token. El servidor obtiene `userId` de esa sesión y no acepta otra cuenta en el cuerpo. Repetir la solicitud sobre un carrito vacío devuelve 200 con `items: []` y `total: 0`; no modifica productos ni carritos de otras cuentas. [CartService.clearCart()](../../src/app/services/cart.service.ts) confirma la respuesta antes de reemplazar la caché y no reintenta una escritura fallida.

Registro, login y health son públicos. Las demás operaciones requieren el token. Los errores habituales son 400 (datos inválidos), 401 (sin sesión válida), 404 (registro o ruta inexistente), 405 (método incorrecto), 409 (conflicto, por ejemplo username repetido) y 503 (MySQL no disponible).

```json
{ "message": "Usuario o contraseña incorrectos." }
```

## Archivos que comparten los endpoints

- [http.php](../../server/http.php): valida el método y devuelve JSON con su código HTTP.
- [auth.php](../../server/auth.php): revisa el token y su vencimiento en sessions.
- [validation.php](../../server/validation.php): interpreta JSON y valida campos.
- [database.php](../../server/database.php): conexión PDO, consultas preparadas y funciones compartidas de usuarios.
- [config.php](../../server/config.php): conexión a novacart en 127.0.0.1:3306.

Para publicar cambios PHP en tu Apache: `npm run api:deploy`. El script copia los archivos compartidos y la carpeta endpoints. No modifica las tablas ni borra los datos.
