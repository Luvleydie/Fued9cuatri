> Documento de la version anterior. La entrega vigente usa cuatro pantallas y PHP/MySQL: [guia actual](PROYECTO_SIMPLE.md).

# API propia de NovaCart

**Revisión: 21 de septiembre de 2026.** API HTTP implementada en TypeScript con `node:http` y persistencia SQLite mediante `node:sqlite`. Las rutas están en [server/app.ts](../server/app.ts); la persistencia en [server/database.ts](../server/database.ts) y la validación en [server/validation.ts](../server/validation.ts).

## Iniciar y localizar la API

Desde la raíz del proyecto:

```bash
npm ci
npm run dev
```

La aplicación abre en `http://localhost:8100`; la API escucha en `http://127.0.0.1:3001/api`. Para ejecutar únicamente la API usa `npm run api`. El frontend configura `apiUrl: '/api'` y utiliza [proxy.conf.json](../proxy.conf.json) durante el desarrollo. `npm run serve:prod` compila el frontend y el servidor y sirve ambos en `http://127.0.0.1:3001`.

Los cuerpos de login y escritura de productos requieren `Content-Type: application/json`. La API devuelve JSON, salvo las respuestas `204`, que no llevan cuerpo.

## Endpoints creados

| Método | Ruta | Autenticación | Entrada | Respuesta correcta |
| --- | --- | --- | --- | --- |
| `GET` | `/api/health` | No | Sin cuerpo. | `200` — `{ "status": "ok", "database": "sqlite" }`. |
| `POST` | `/api/auth/login` | No | `LoginRequest`. | `200` — `AuthResponse`. |
| `GET` | `/api/auth/me` | Bearer | Sin cuerpo. | `200` — `User`. |
| `POST` | `/api/auth/logout` | Bearer | Sin cuerpo. | `204` — sesión revocada. |
| `GET` | `/api/products` | Bearer | Sin cuerpo. | `200` — `ProductsResponse`. |
| `GET` | `/api/products/:id` | Bearer | Identificador entero positivo. | `200` — `Product`. |
| `POST` | `/api/products` | Bearer | `ProductInput`. | `201` — `Product`; encabezado `Location: /api/products/{id}`. |
| `PUT` | `/api/products/:id` | Bearer | Identificador y `ProductInput` completo. | `200` — `Product` actualizado. |
| `DELETE` | `/api/products/:id` | Bearer | Identificador entero positivo. | `204` — producto eliminado. |

Todas las operaciones de productos requieren una sesión válida, incluidas las consultas. Cualquier usuario autenticado puede administrar el inventario; no hay roles ni restricciones por creador. `created_by` se asigna en el servidor al crear y se conserva al editar.

## Login y sesión

La inicialización local crea la cuenta de demostración `emilys` / `emilyspass`.

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "emilys",
  "password": "emilyspass",
  "expiresInMins": 60
}
```

Respuesta ilustrativa; el token es distinto en cada login:

```json
{
  "id": 1,
  "username": "emilys",
  "email": "emily@novacart.local",
  "firstName": "Emily",
  "lastName": "Johnson",
  "image": "",
  "accessToken": "TOKEN_DEVUELTO_POR_EL_SERVIDOR"
}
```

`username` admite de 1 a 100 caracteres después de quitar espacios extremos; `password`, de 1 a 200 sin recortar su contenido. `expiresInMins` es opcional, vale 60 por defecto y acepta enteros entre 1 y 1440. La pantalla solicita 60 minutos. Credenciales incorrectas producen `401`; una entrada inválida produce `400`.

Las siguientes peticiones incluyen:

```http
Authorization: Bearer TOKEN_DEVUELTO_POR_EL_SERVIDOR
```

El servidor firma el token con HMAC-SHA256 y comprueba tanto su firma y vencimiento como su sesión activa en SQLite. La contraseña se guarda con `scrypt` y sal; la tabla de sesiones almacena el hash SHA-256 del token. `POST /api/auth/logout` elimina esa sesión, de modo que reutilizar el mismo token produce `401`. No se implementa renovación de tokens.

Si el navegador no logra contactar la API al cerrar sesión, elimina sus datos locales; la sesión remota permanece hasta su vencimiento. El perfil nunca recibe contraseña, hash o sal.

## Crear y actualizar productos

Ejemplo de `ProductInput`, válido para `POST /api/products` y `PUT /api/products/:id`:

```json
{
  "title": "Cuaderno de TypeScript",
  "description": "Cuaderno de 100 hojas para apuntes.",
  "category": "papeleria",
  "price": 8.5,
  "stock": 20,
  "brand": "NovaCart",
  "thumbnail": "assets/products/product-placeholder.svg"
}
```

| Campo | Regla |
| --- | --- |
| `title` | Texto obligatorio de 1 a 160 caracteres. |
| `description` | Texto obligatorio de 1 a 2000 caracteres. |
| `category` | Texto obligatorio de 1 a 80 caracteres. |
| `price` | Número entre 0 y 1 000 000; máximo dos decimales. Se almacena en centavos. |
| `stock` | Número entero entre 0 y 1 000 000. |
| `brand` | Texto opcional, máximo 120 caracteres; si se omite queda vacío. |
| `thumbnail` | Texto opcional, máximo 2000 caracteres. Permite URL `http:`/`https:` sin credenciales o ruta segura dentro de `assets/`; puede estar vacío. |

Los textos se recortan en sus extremos y se rechazan caracteres de control no permitidos. Los números deben ser JSON numéricos, no cadenas. `PUT` requiere todos los campos obligatorios y sustituye los opcionales: omitir `brand` o `thumbnail` los deja vacíos. No es una actualización parcial mediante `PATCH`.

El servidor asigna `id`, autor y fechas. Los campos adicionales del JSON no se usan para sobrescribirlos. `rating` y `discountPercentage` no son editables en este CRUD y se conservan al actualizar. La galería `images` sigue a `thumbnail` cuando éste cambia; al crear se genera un arreglo con la miniatura, o vacío si no hay imagen.

Respuesta ilustrativa de creación; el identificador se debe obtener de la respuesta real:

```json
{
  "id": 101,
  "title": "Cuaderno de TypeScript",
  "description": "Cuaderno de 100 hojas para apuntes.",
  "category": "papeleria",
  "price": 8.5,
  "stock": 20,
  "brand": "NovaCart",
  "thumbnail": "assets/products/product-placeholder.svg",
  "images": ["assets/products/product-placeholder.svg"]
}
```

## Consultar y eliminar

`GET /api/products` devuelve todos los productos ordenados por `id`, con la forma siguiente:

```typescript
interface ProductsResponse {
  products: Product[];
  total: number;
  skip: number;
  limit: number;
}
```

El servidor no pagina ni filtra por parámetros: `skip` es siempre `0`, y `limit` y `total` coinciden con el número de productos. `/api/products?limit=0` conserva la compatibilidad con la llamada del frontend y devuelve la colección completa. La búsqueda por título, categoría o marca se realiza en la pantalla.

`GET /api/products/:id` devuelve el objeto individual. `DELETE /api/products/:id` borra su fila; consultarlo después produce `404`. Los identificadores mal formados producen `400` y los identificadores válidos sin producto producen `404`.

## Errores

Todos los errores de la API tienen la forma `ApiError`:

```json
{
  "message": "Revisa los campos del producto.",
  "errors": {
    "stock": "Introduce existencias enteras entre 0 y 1000000."
  }
}
```

`errors` sólo aparece cuando se detallan fallos de campos.

| Código | Causa |
| --- | --- |
| `400` | JSON mal formado, cuerpo distinto de objeto, campos inválidos o identificador incorrecto. |
| `401` | Credenciales incorrectas, token ausente, inválido, vencido o revocado. Incluye `WWW-Authenticate: Bearer`. |
| `404` | Producto o ruta inexistente. |
| `405` | Método no permitido; el encabezado `Allow` enumera los métodos admitidos. |
| `413` | Cuerpo superior a 64 KiB. |
| `415` | Cuerpo enviado sin `Content-Type: application/json`. |
| `500` | Error interno; el mensaje no expone detalles de la base de datos. |

## Persistencia y configuración

El archivo predeterminado es `server/data/novacart.sqlite`; el secreto de firma se conserva a su lado en `server/data/novacart.sqlite.secret`. No se deben versionar esos archivos. La cuenta demo y los seis productos iniciales se insertan una sola vez, mediante la versión del esquema. Vaciar el inventario y reiniciar no vuelve a insertar productos borrados.

`PORT` cambia el puerto de la API ejecutada por separado y `DB_PATH` su archivo SQLite. `npm run dev` fija el puerto 3001 porque el proxy de Angular apunta a él. Ejemplo de base separada en PowerShell:

```powershell
$env:DB_PATH = 'C:\Fued3\server\data\practica.sqlite'
npm run api
```

El servidor escucha en la interfaz local `127.0.0.1` y sirve `www/` cuando existe una compilación del frontend. El flujo de desarrollo usa proxy y el compilado usa el mismo origen; no se habilita CORS para otros orígenes.

## Demostración reproducible

En [api-ejemplos.http](api-ejemplos.http) se incluye la secuencia: salud, login, perfil, listado, crear, consultar, editar, eliminar, comprobar `404` y logout. Los ejemplos usan respuestas nombradas compatibles con REST Client; en otro cliente copia el `accessToken` del login y el `id` de la creación.

La prueba automatizada `npm run test:api` verifica el servidor sobre bases temporales. Los resultados realmente ejecutados se registran en [VERIFICACION.md](VERIFICACION.md). El carrito y la compra simulada no tienen endpoints propios.

Referencias técnicas consultadas durante la implementación: [SQLite en Node.js 24](https://nodejs.org/docs/latest-v24.x/api/sqlite.html) para el acceso a SQLite y [proxy de desarrollo de Angular](https://angular.dev/tools/cli/serve#proxying-to-a-backend-server) para conectar `/api` con el servidor local.
