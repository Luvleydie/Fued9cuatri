# NovaCart: cuatro pantallas y MySQL

App académica con **Angular/Ionic, interfaces TypeScript, Axios, PHP y MySQL de XAMPP**.

| Pantalla | Ruta | Función |
|---|---|---|
| Login | /login | Autenticar y guardar la sesión en sessionStorage |
| Registro | /register | Crear una cuenta |
| Inicio | /home | CRUD de usuarios |
| Carrito | /cart | Agregar, consultar, cambiar cantidades y quitar artículos |

## Abrir la app

Activa **Apache y MySQL** en XAMPP. La base se llama **novacart**, en **127.0.0.1:3306**.

**App instalada:** http://localhost/novacart/

Cuenta de demostración: **emilys / emilyspass**.

Para preparar otra copia del proyecto:

```powershell
npm ci
npm run db:setup
npm run deploy:xampp
```

La base debe existir previamente. El instalador crea las tablas sin eliminar datos y agrega una cuenta demo y tres productos si faltan. Usa PHP 8.2 con PDO MySQL y Argon2id, Node 24.15+ de la rama 24 y npm 11.19.1+. La carpeta de XAMPP predeterminada es C:/xampp; se puede cambiar con XAMPP_PATH.

Para editar con recarga automática:

```powershell
npm run dev
```

Abre http://localhost:8100. El proxy dirige Axios a la API PHP de Apache. Tras cambiar PHP, ejecuta `npm run api:deploy`; tras cambiar Angular, `npm run deploy:xampp` actualiza la copia de Apache.

## Código principal

- [login.page.ts](src/app/pages/login/login.page.ts) y [login.page.html](src/app/pages/login/login.page.html): `async login(): Promise<void>`, `isSubmitting`, `failLogin`, `timer[]`, Axios y navegación con `replaceUrl`.
- [Home](src/app/pages/home/home.page.ts): `users: User[] = []`, carga asíncrona y CRUD.
- [CartItem](src/app/models/cart-item.model.ts), [carrito](src/app/pages/cart/cart.page.ts) y [servicio](src/app/services/cart.service.ts): interfaces y asignación de datos.
- [API PHP](server/index.php), [conexión](server/config.php) y [tablas MySQL](server/schema.sql).
- [MCP](mcp/server.mjs) y [configuración de Codex](.codex/config.toml).

Los usuarios y carritos permanecen en MySQL. La sesión de la pestaña usa sessionStorage y vence después de una hora. No se guardan contraseñas en el navegador.

El CRUD es una práctica sin roles: todos los usuarios autenticados pueden administrar usuarios. El carrito no realiza pagos.

## Documento y comprobaciones

[Documento explicado](docs/PROYECTO_SIMPLE.md) · [PDF](output/pdf/NovaCart_Guia.pdf) · [Verificación](docs/VERIFICACION_SIMPLE.md)

[Setear, promesas y flujo de datos paso a paso](docs/FLUJO_DATOS_Y_PROMESAS.md) · [APIs en archivos separados y ejemplos HTTP](docs/api/README.md)

[Video de persistencia](docs/videos/novacart-mysql.mp4) · [Capturas](docs/screenshots-simple/)

```powershell
npm test -- --watch=false
npm run lint
npm run test:api
npm run test:e2e
npm run test:mcp
```

Las pruebas de API y navegador crean usuarios temporales y eliminan únicamente los registros de esa ejecución. Requieren Apache, MySQL y la API instalada.

El MCP ya se comprobó desde Codex. Para cargarlo en otra sesión, vuelve a abrir el proyecto. `codex mcp get novacart_mysql` muestra su configuración; `npm run test:mcp` comprueba la conexión real.

Para regenerar el PDF o video: `python -m pip install -r scripts/requirements-delivery.txt`, luego `npm run document` o `npm run video:demo`. El video requiere Chrome o un navegador instalado para Playwright.

Los documentos y videos anteriores corresponden a la versión histórica con SQLite. La documentación vigente es la enlazada arriba.
