# NovaCart

Una pequeña aplicación de comercio electrónico para explorar productos, consultar detalles y gestionar un carrito de compras. Proyecto académico desarrollado con **Ionic + Angular basado en NgModules + TypeScript + Axios**.

**Estado: Proyecto académico funcional.** El proceso de compra es una simulación y no procesa pagos reales.

## Objetivo

Desarrollar una aplicación e-commerce utilizando Ionic y Angular con arquitectura NgModules, integración de API REST mediante Axios, autenticación de usuarios y gestión local de un carrito de compras. El código mantiene una estructura sencilla y explicable en clase.

## Tecnologías y versiones verificadas

| Tecnología | Versión utilizada |
| --- | --- |
| Node.js | 24.19.0 |
| npm | 11.19.1 |
| Ionic CLI | 7.2.1 |
| Ionic Angular | 9.0.3 |
| Angular | 22.1.6 |
| Angular CLI / Build | 22.1.8 |
| TypeScript | 6.0.3 |
| Axios | 1.20.0 |
| Capacitor Core / CLI | 8.4.3 |
| Vitest | 4.1.11 |
| Playwright | 1.63.0 |
| Git | 2.55.0.windows.3 |
| API REST | DummyJSON |
| Repositorio | GitHub |

Versiones obtenidas con `node --version`, `npm --version`, `ionic --version`, `npx ng version`, `npm list --depth=0` y `git --version`. El archivo `package-lock.json` conserva la resolución de las dependencias.

## Instalación y ejecución

Se recomienda Node.js 24.19.0 o una versión compatible de Node 24 desde 24.15.0 y npm 11.19.1 o posterior. Instala Ionic CLI si no está disponible:

```bash
npm install -g @ionic/cli@7.2.1
git clone https://github.com/Luvleydie/Fued9cuatri.git
cd Fued9cuatri
npm install
ionic serve
```

Abre `http://localhost:8100`. Los archivos de Ionic están directamente en la raíz del repositorio; no hay una subcarpeta adicional de la aplicación.

Para reproducir exactamente las dependencias del lockfile también puedes utilizar `npm ci` en lugar de `npm install`.

Para generar la compilación de producción:

```bash
ionic build
```

El resultado se escribe en `www/`, carpeta excluida de Git. `capacitor.config.ts` proporciona la base híbrida y apunta a ese directorio. Esta entrega se ejecuta en navegador; no incluye proyectos nativos, APK/IPA ni publicación en tiendas.

## Usuario de demostración

Credenciales comprobadas contra la API pública de DummyJSON:

```text
Usuario: emilys
Contraseña: emilyspass
```

En el login, **Usar cuenta de demostración** rellena estos datos y **Ingresar** realiza la petición real. Es una cuenta pública de prueba; no corresponde a credenciales privadas. DummyJSON puede cambiar sus datos de demostración en el futuro.

## Funcionalidades y navegación

| Vista | Ruta | Funcionalidad |
| --- | --- | --- |
| Login | `/login` | Validación, autenticación real y errores amigables. |
| Productos | `/home` | Catálogo completo y búsqueda por nombre, categoría o marca. `/products` redirige aquí. |
| Detalle | `/product/:id` | Imagen, descripción, precio, categoría, marca, descuento, rating y stock. |
| Carrito | `/cart` | Agregar, modificar cantidades, eliminar, vaciar y finalizar una compra simulada. |
| Perfil | `/profile` | Información obtenida de la API y cierre de sesión. |

- Persistencia de sesión y carrito después de actualizar el navegador.
- Guards para las rutas privadas y redirección de rutas desconocidas.
- Navegación inferior con contador de unidades del carrito.
- Diseño adaptable a teléfono, tablet y escritorio mediante Ionic Grid.
- Estados de carga, vacío, error y reintento; Toasts y Alerts de Ionic.
- Cantidades enteras positivas, límites de stock y totales calculados en centavos.

Los precios se muestran en **USD**, sin añadir impuestos ni envíos. `price` es el importe utilizado en el carrito; `discountPercentage` se muestra como dato informativo y no se descuenta otra vez. El stock representa una referencia de demostración y no una reserva de inventario.

## Estructura del proyecto

```text
src/app/
├── core/api/          # Axios y almacenamiento de sesión
├── data/              # Seis productos de respaldo
├── guards/            # Protección de rutas
├── models/            # Interfaces TypeScript
├── pages/             # Login, home, detalle, carrito y perfil
├── services/          # AuthService, ProductsService y CartService
├── app.module.ts
└── app-routing.module.ts
docs/                  # Documentación y capturas
scripts/               # Verificación en navegador y capturas reproducibles
```

Cada página tiene su `*.module.ts` y `*-routing.module.ts`, además de TypeScript, HTML y SCSS. Los componentes declaran `standalone: false`. Las rutas usan `loadChildren` y los módulos importan `IonicModule` desde `@ionic/angular/lazy`, `CommonModule` y los módulos de formularios necesarios.

El starter de Angular 22 funciona sin Zone.js. Se usan signals sencillas para que los resultados asíncronos de Axios actualicen la interfaz. No se utiliza NgRx, un backend propio ni una base de datos externa.

## Modelo inicial de datos

| Modelo | Representa |
| --- | --- |
| `Product` | Información del producto ofrecido por DummyJSON. |
| `User` | Datos básicos del usuario autenticado. |
| `CartItem` | Un `Product` y una cantidad seleccionada. |
| `AuthResponse` | Datos básicos del usuario, `accessToken` y `refreshToken` recibidos en el login. |

Un carrito contiene varios `CartItem`; cada uno guarda un producto y su cantidad. La respuesta paginada se describe con `ProductsResponse`, y `ProductSource` permite distinguir datos de API y datos locales.

[Consultar el modelo completo y diagrama Mermaid](docs/MODELO_DATOS.md).

## API REST y Axios

Base: [DummyJSON](https://dummyjson.com). Se configura en los archivos de entorno y se consume mediante una única instancia de Axios con timeout de 15 segundos y encabezados JSON.

| Método | Endpoint | Uso |
| --- | --- | --- |
| POST | `/auth/login` | Enviar `username`, `password` y duración de sesión. |
| GET | `/auth/me` | Consultar el perfil con `Authorization: Bearer accessToken`. |
| GET | `/products?limit=0` | Obtener la colección completa para la búsqueda local. |
| GET | `/products/:id` | Consultar un producto específico. |

El interceptor agrega automáticamente el token vigente. La aplicación comprueba su vencimiento al proteger rutas; una respuesta 401/403 del perfil termina la sesión. La duración solicitada es de 60 minutos y no se renueva automáticamente.

Ante errores de red o respuestas 5xx de productos, se utilizan seis productos locales con imágenes incluidas en el repositorio y un aviso visible. **Los errores 4xx y los identificadores inexistentes no activan ese respaldo.** El botón Reintentar vuelve a consultar la API. El login siempre requiere una conexión real.

## Persistencia y límites académicos

Las claves son `novacart.accessToken`, `novacart.user` y `novacart.cart`. Cerrar sesión elimina token y usuario, conservando el carrito del navegador. Los datos corruptos se descartan de forma segura.

No se almacenan contraseñas ni el payload completo de `/auth/me`. Se seleccionan expresamente los campos del modelo `User`; tampoco se persiste el refresh token. Guardar access tokens en `localStorage` es una simplificación permitida para esta demostración académica, no una propuesta de autenticación para producción.

## Pruebas y capturas reproducibles

```bash
npm test -- --watch=false
npm run lint
ionic build
```

Para las pruebas de navegador, mantén la aplicación ejecutándose en otra terminal:

```bash
ionic serve --no-open
```

Después ejecuta:

```bash
npm run test:e2e
npm run screenshots
```

Los scripts utilizan Chrome instalado. Si no está disponible, instala Chromium con `npx playwright install chromium`; el script recurrirá a él. Playwright es sólo una dependencia de desarrollo y no interviene en la ejecución normal de NovaCart.

Puedes cambiar la dirección con la variable `BASE_URL`. Por ejemplo, en PowerShell: `$env:BASE_URL = 'http://localhost:8100'`. La variable opcional `CHROME_CHANNEL` permite elegir otro canal compatible, como `msedge`.

`verify-app.mjs` comprueba recorridos reales y casos de fallo controlados; escribe resultados y capturas de revisión en `artifacts/browser/`, excluido de Git. Los datos de sesión del navegador se mantienen únicamente en memoria. `capture-screenshots.mjs` genera las cinco capturas de entrega sin interceptar ni simular las peticiones de la API.

[Resultados de las comprobaciones y criterios de aceptación](docs/VERIFICACION.md).

## Capturas de ejecución

### Login

![Login de NovaCart](docs/screenshots/01-login.png)

### Productos

![Catálogo de productos de NovaCart](docs/screenshots/02-products.png)

### Detalle

![Detalle de un producto](docs/screenshots/03-product-detail.png)

### Carrito

![Carrito con cantidades y total](docs/screenshots/04-cart.png)

### Perfil

![Perfil del usuario autenticado](docs/screenshots/05-profile.png)

## Uso de Inteligencia Artificial

La IA apoyó la estructura inicial, modelos, consumo de API, interfaz, depuración, pruebas y documentación. Las instrucciones se reconstruyen a partir de las fases realizadas y se distinguen de una transcripción literal.

- [Consultar evidencia de prompts y evaluación del código](docs/EVIDENCIA_IA.md).
- [Documento breve: prompt, objetivo y resultado final](docs/PROMPTS_DESARROLLO.md).
- [Modelo de datos](docs/MODELO_DATOS.md).

## Decisiones y correcciones del entorno

La descarga inicial de Ionic CLI se interrumpió por `ECONNRESET`; se recuperó el mismo starter oficial mediante PowerShell. Se actualizó npm 11.2.0 a 11.19.1 por un fallo interno de resolución de dependencias y se realizó una instalación limpia al alinear los paquetes Angular 22.1.6 con las herramientas 22.1.8.

Capacitor Core y CLI se fijaron en 8.4.3 para evitar una dependencia vulnerable introducida por la rama 8.5 del CLI. Se ajustaron los navegadores objetivo y el presupuesto SCSS a 4 KB de aviso y 6 KB de error por componente, manteniendo las hojas pequeñas y la compilación sin advertencias de presupuesto.

El repositorio conserva commits lógicos de inicialización, autenticación, catálogo, detalle/carrito, perfil/navegación y documentación.
