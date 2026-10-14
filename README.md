# NovaCart: cuatro pantallas y MySQL

App académica con **Angular/Ionic, interfaces TypeScript, Axios, PHP y MySQL de XAMPP**.

**[Documento de entrega: funcionalidades, evidencias, repositorio, APK y bitácora de IA](ENTREGA_PROYECTO_IONIC.md).**

Repositorio: [Luvleydie/Fued9cuatri](https://github.com/Luvleydie/Fued9cuatri), rama principal `main`.

## Entrega de conexión con API REST

[Informe de la entrega REST](docs/ENTREGA_API_REST.md) · [Documento Word con capturas](output/NovaCart_Entrega_API_REST.docx)

La integración usa servicios Angular con Axios y una API PHP que persiste en MySQL. Incluye `GET`, `POST`, `PUT` y `DELETE`, manejo de respuestas y errores e indicadores de carga. `PUT` cubre el requisito de actualización `PUT/PATCH`.

Con Apache y MySQL activos, ejecuta `npm run deploy:xampp` y `npm run test:rest-delivery` para repetir el recorrido del navegador. La prueba crea y elimina únicamente su usuario temporal, guarda capturas en `docs/screenshots-rest/` y registra los métodos y estados HTTP en `docs/evidencia/rest-verificacion.json`. La latencia y el error 503 usados para demostrar los estados de interfaz se simulan de forma controlada en la prueba.

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

[Actividad Data Driven](docs/ACTIVIDAD_DATA_DRIVEN.md) · [Texto resumido: objetivo, prompt y resultado](docs/RESUMEN_DATA_DRIVEN.md)

Login, registro y usuarios usan formularios reactivos tipados con validación compartida y errores por campo. El carrito genera sus controles de cantidad con `FormArray`. La confirmación de contraseña es solo de la interfaz y no se envía a la API. Prueba específica: `npm run test:data-driven`.

[Conexión, errores y caché sin red](docs/CONEXION_Y_CACHE.md) · [Bitácora de problemas y prompts de IA](docs/BITACORA_IA_CONEXION.md)

La app detecta la desconexión y conserva datos de consulta durante una hora por sesión. Los avisos muestran cuándo se usa una copia temporal; al usar esa copia, hay que recuperar la conexión y actualizar los datos antes de guardar cambios. La versión de producción permite recargar sin red después de instalar sus recursos en una primera visita. Prueba automatizada: `npm run test:offline` (requiere la app instalada en XAMPP).

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

## Gráficas D3.js y mejoras de diseño

La pantalla **Carrito** incluye tres gráficas D3: precios del catálogo, existencias y distribución del importe por artículo. Utilizan los datos cargados de la API o su copia válida y se actualizan con las cantidades confirmadas. La aplicación incorpora navegación compartida adaptable, búsqueda de usuarios y productos y controles para mostrar u ocultar contraseñas.

[Dónde está el código y cómo funciona D3](docs/GRAFICAS_D3.md). Prueba: `npm run test:d3`.

## Catálogo y carrito

El catálogo permite ordenar por nombre o precio, filtrar por existencias y buscar sin distinguir tildes. Orden y disponibilidad se conservan al recargar; también funcionan sobre una copia válida sin conexión. **Vaciar carrito** solicita confirmación y elimina únicamente los artículos de la cuenta conectada. El total y la gráfica se actualizan cuando el servidor confirma; ante un fallo se conservan los datos visibles y se solicita actualizar.

[Código, funcionamiento y bitácora de esta ampliación](docs/MEJORAS_CATALOGO_Y_CARRITO.md). Prueba de interfaz y recarga offline: `npm run test:catalog`.

**Lista de compra:** el carrito permite revisar y copiar un resumen con productos, cantidades guardadas, precios y total; en la web también se descarga como TXT. La lista identifica la fecha y el origen de los datos, incluidos los de la copia temporal sin conexión. Prueba: `npm run test:shopping-list`.

El diseño de tianguis incluye microbuses e ilustraciones grandes. En pantallas pequeñas, las imágenes se colocan en filas propias para conservar espacio para los botones y formularios.

## Android y APK

También está instalado `@capawesome/capacitor-photo-editor` para Android, con las rutas de FileProvider configuradas. Su API `PhotoEditor.editPhoto({ path })` abre una app de edición instalada en el teléfono; requiere la ruta nativa de una imagen. Consulta la [documentación de Photo Editor](https://capawesome.io/plugins/photo-editor/).

La compilación móvil tiene una API configurable, soporte CORS en PHP y salida independiente de la web. Ejecuta `npm run mobile:apk -- --emulator` para generar el APK debug contra XAMPP, o proporciona `--api-url https://servidor/novacart/api`. El instalador se guarda en `output/android/NovaCart-debug.apk`. Consulta los [pasos y requisitos del cliente móvil](docs/CLIENTE_MOVIL.md).

En **Inicio / Datos de usuario** puedes seleccionar un archivo y enviar su metadata por Bluetooth Low Energy a otro Android con NovaCart o a un periférico BLE compatible. Consulta los [pasos de envío, recepción y protocolo para otros dispositivos](docs/BLUETOOTH_METADATA.md).

El MCP ya se comprobó desde Codex. Para cargarlo en otra sesión, vuelve a abrir el proyecto. `codex mcp get novacart_mysql` muestra su configuración; `npm run test:mcp` comprueba la conexión real.

Para regenerar el PDF o video: `python -m pip install -r scripts/requirements-delivery.txt`, luego `npm run document` o `npm run video:demo`. El video requiere Chrome o un navegador instalado para Playwright.

Los documentos y videos anteriores corresponden a la versión histórica con SQLite. La documentación vigente es la enlazada arriba.
