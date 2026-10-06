# Entrega del proyecto Ionic: NovaCart

**Fecha:** 2 de octubre de 2026.

**Repositorio:** [Luvleydie/Fued9cuatri](https://github.com/Luvleydie/Fued9cuatri). **Rama principal:** `main`.

NovaCart es una aplicación académica de usuarios y carrito desarrollada con Ionic/Angular, TypeScript, Axios, PHP y MySQL. Este documento reúne la implementación, las evidencias y los límites de la entrega. La versión comprobable en navegador se ejecuta en `http://localhost/novacart/` después de instalarla en XAMPP.

## 1. Estado de los requisitos

| Requisito | Estado y evidencia |
| --- | --- |
| Proyecto Ionic funcional | Implementación web con cuatro pantallas, servicios y API; instrucciones en [README.md](README.md). |
| Navegación | Rutas con carga diferida y protección de sesión. |
| Modelo de datos | Interfaces TypeScript y cuatro tablas relacionadas en MySQL. |
| CRUD | Crear, consultar, editar y eliminar usuarios; agregar, consultar, actualizar y quitar artículos del carrito. |
| Persistencia | MySQL conserva usuarios y carritos; almacenamiento temporal separado en el navegador. |
| Manejo de errores | Validación por campo, estados de carga y mensajes de red, API y sesión. |
| Operación offline básica | Consulta de copias válidas y recarga de la interfaz previamente descargada. |
| Repositorio Git | Código y documentación de la entrega en la [rama main](https://github.com/Luvleydie/Fued9cuatri/tree/main). |
| APK | **Pendiente de generación y prueba en Android.** Existe el proyecto nativo; no se adjunta un APK verificado. |
| README.md | Incluye requisitos, instalación, ejecución, comandos y documentación. |
| Bitácora asistida por IA | Problemas, objetivos, extractos de prompts y resultados en la sección 10. |

## 2. Proyecto funcional y navegación

La interfaz utiliza Ionic 9 y Angular 22; Capacitor 8 proporciona la estructura Android. Axios conecta con la API PHP, que valida solicitudes y consulta MySQL mediante PDO.

| Pantalla | Ruta | Acceso y función |
| --- | --- | --- |
| Login | `/login` | `guestGuard`: autenticación; una sesión existente redirige a Inicio. |
| Registro | `/register` | `guestGuard`: alta de cuenta con validación. |
| Inicio / Usuarios | `/home` | `authGuard`: administración de usuarios autenticados. |
| Carrito | `/cart` | `authGuard`: catálogo y carrito de la cuenta activa. |

La ruta raíz y las desconocidas redirigen a Login. Los guards verifican la sesión local; la API comprueba además el token en cada operación protegida. Véanse [rutas](src/app/app-routing.module.ts) y [guards](src/app/guards/auth.guard.ts). El ejercicio no implementa roles: cualquier usuario autenticado puede administrar usuarios. El carrito no procesa pagos.

## 3. Modelo de datos

El esquema vigente está en [server/schema.sql](server/schema.sql); las interfaces están en [src/app/models](src/app/models/).

| Tabla SQL | Campos principales | Correspondencia TypeScript |
| --- | --- | --- |
| `users` | `id`, `username` único, `email`, `first_name`, `last_name`, `password_hash`, `created_at` | `User` representa datos públicos; `UserInput`, los campos editables. |
| `sessions` | `token_hash`, `user_id`, `expires_at` | `AuthResponse` entrega usuario, token y vencimiento al iniciar sesión. |
| `products` | `id`, `title`, `price`, `stock` | `Product` y `ProductsResponse`. |
| `cart_items` | `user_id`, `product_id`, `quantity` | `CartItem`; `CartResponse` contiene artículos y total calculado. |

Un usuario tiene sesiones y artículos de carrito. Cada artículo referencia un producto; la clave compuesta usuario/producto evita duplicados. Las claves foráneas mantienen las relaciones y eliminan dependencias al borrar su registro principal. La cantidad se limita a 1–99 y la API verifica existencias. Las contraseñas se guardan como hash; no forman parte de `User` ni de la caché de consultas.

## 4. CRUD y Data Driven

Las rutas siguientes son relativas a la base `/novacart/api` de XAMPP:

| Operación | Método y endpoint |
| --- | --- |
| Crear, consultar, editar y eliminar usuarios | `POST /users`, `GET /users`, `PUT /users/{id}`, `DELETE /users/{id}` |
| Consultar productos y carrito | `GET /products`, `GET /cart` |
| Agregar o actualizar cantidad | `PUT /cart/{productId}` con `{ "quantity": 2 }` |
| Quitar artículo | `DELETE /cart/{productId}` |
| Registro, login, perfil y cierre de sesión | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` |

El catálogo es de consulta; no existe un CRUD de productos en esta versión. Las operaciones se implementan en [endpoints PHP](server/endpoints/) y se consumen desde [servicios Angular](src/app/services/). Hay ejemplos reproducibles en [docs/api/README.md](docs/api/README.md).

Data Driven se aplica como formularios reactivos definidos desde TypeScript: `FormGroup`, `FormControl`, controles no nulos, metadatos y validadores compartidos. Registro y Usuarios validan confirmación de contraseña; al editar puede conservarse la contraseña anterior. El carrito utiliza `FormArray` para sus cantidades. Se impiden envíos inválidos o duplicados, se conservan campos ante fallos y la confirmación nunca se envía a PHP. Detalles en [actividad completa](docs/ACTIVIDAD_DATA_DRIVEN.md) y [resumen de objetivo, prompt y resultado](docs/RESUMEN_DATA_DRIVEN.md).

## 5. Persistencia y manejo de errores

| Capa | Datos y duración |
| --- | --- |
| MySQL | Usuarios, productos, sesiones y carritos; es la fuente de datos persistente del servidor. |
| Sesión del navegador | `sessionStorage` conserva la sesión de la pestaña, con vencimiento de una hora. |
| Caché de consultas | Últimas respuestas válidas de usuarios, productos y carrito, aisladas por sesión y con vigencia máxima de una hora. |
| Memoria | Respaldo cuando falla `sessionStorage`; desaparece al recargar. |
| Service worker | Archivos públicos de producción: HTML, scripts, estilos y recursos. Excluye API y autenticación. |

Se consulta primero la red. La caché se utiliza ante desconexión, timeout, fallo de red o HTTP 5xx; no oculta errores 401/403/404 ni respuestas inválidas. Cerrar o cambiar la sesión limpia sus datos temporales. Una escritura confirmada actualiza o invalida la copia correspondiente.

La [capa de API](src/app/core/api/) detecta eventos `online`/`offline` y observa las solicitudes: tener red no garantiza que Apache o MySQL respondan. Axios limita la espera a 15 segundos. Los avisos en español distinguen falta de conexión, servicio inaccesible, sesión vencida y validación; los errores técnicos no se muestran como mensajes de formulario. Los estados de carga se liberan al terminar. Una escritura sin respuesta confirmada conserva los campos y solicita actualizar antes de reintentar; no se reenvía automáticamente.

## 6. Operación offline y evidencia

La operación offline es **de consulta**. Requiere una primera visita con red, una sesión vigente, datos previamente cargados y la instalación completa del service worker. Login, registro y modificaciones requieren conexión. La recarga offline corresponde al build de producción sobre HTTPS o localhost.

Prueba manual reproducible:

1. Abre la versión instalada, inicia sesión y visita Usuarios y Carrito.
2. En DevTools → Application → Service Workers comprueba que el worker esté activado y controle la página.
3. En Network selecciona **Offline**, pulsa **Actualizar** y recarga.
4. Captura los datos visibles, el aviso de copia temporal, los controles de escritura bloqueados y la opción Offline.
5. Regresa a **No throttling** y actualiza: una respuesta válida vuelve a habilitar los cambios.

Evidencias: [carrito sin red](docs/screenshots-conexion/01-carrito-sin-conexion.png), [usuarios tras recargar](docs/screenshots-conexion/02-usuarios-recarga-sin-conexion.png) y [reporte de conexión](docs/evidencia/conexion-verificacion.json). La [guía de conexión](docs/CONEXION_Y_CACHE.md) explica también los casos sin copia, sesión vencida y almacenamiento lleno.

Verificación de esta entrega:

| Comprobación | Resultado |
| --- | --- |
| Pruebas unitarias | 208 aprobadas en 13 archivos. |
| Service worker | 6 aprobadas. |
| Formularios Data Driven | 4 escenarios aprobados con API simulada. |
| Integración de navegador con MySQL | 5 escenarios aprobados. |
| API | 26 comprobaciones aprobadas. |
| Conexión y operación offline | 7 escenarios aprobados. |
| Estilo y compilación/despliegue local | Aprobados. |

Reportes: [API](docs/evidencia/api-entrega.json), [regresión de navegador](docs/evidencia/regresion-entrega.json) y [verificación consolidada](docs/evidencia/entrega-verificacion.json).

## 7. Instalación, README y pruebas

Requisitos: Node y npm compatibles con [package.json](package.json), PHP 8.2 con PDO MySQL y Argon2id, Apache y MySQL en XAMPP. Crea previamente la base `novacart` y activa ambos servicios.

```powershell
npm ci
npm run db:setup
npm run deploy:xampp
```

Abre `http://localhost/novacart/`; cuenta de demostración: `emilys / emilyspass`. Para desarrollo utiliza `npm run dev`. El [README](README.md) contiene la configuración y los enlaces vigentes.

```powershell
npm test -- --watch=false
npm run lint
npm run test:offline-shell
npm run test:api
npm run test:data-driven
npm run test:e2e
npm run test:offline
```

Data Driven utiliza respuestas simuladas para comprobar los formularios. Las pruebas de integración requieren XAMPP y la aplicación instalada; pueden crear registros temporales y eliminan los de su ejecución.

## 8. Repositorio Git

La entrega se publica en [Luvleydie/Fued9cuatri](https://github.com/Luvleydie/Fued9cuatri), rama `main`. El código, esquema, scripts, README, documentos y evidencias permiten reproducir el proyecto. Los archivos locales de configuración, dependencias y salidas de compilación se excluyen mediante [.gitignore](.gitignore).

```powershell
git clone --branch main https://github.com/Luvleydie/Fued9cuatri.git
cd Fued9cuatri
```

## 9. APK

Existe la [estructura Android](android/) y [configuración Capacitor](capacitor.config.ts): identificador `com.novacart.app`, versión `1.0`, Android mínimo API 24 y objetivo API 36. **No existe un APK entregado ni una prueba de funcionamiento en dispositivo.**

Antes de compilar hay que configurar una URL de API accesible desde Android y permitir su origen en el backend. La configuración web actual utiliza `api`: dentro del contenedor nativo resolvería hacia su propio `https://localhost/api`, donde no existe XAMPP. También deben sincronizarse los recursos web actuales.

Después de resolver esa configuración:

```powershell
npm run build -- --base-href=/
npx cap sync android
npx cap open android
```

En Android Studio, compilar el APK de depuración con JDK 21 y SDK 36. La salida esperada es `android/app/build/outputs/apk/debug/app-debug.apk`. Queda pendiente instalarlo en emulador o teléfono y verificar autenticación, CRUD, persistencia y consulta offline. El APK no incorpora PHP ni MySQL: necesita acceso al servidor configurado.

## 10. Bitácora de desarrollo asistido por IA

Los prompts siguientes son **extractos documentados** de instrucciones usadas durante el desarrollo, no conversaciones reconstruidas. Los resultados describen cambios implementados; su comprobación depende de las pruebas y evidencias anteriores.

| Problema encontrado | Qué quería que hiciera la IA | Prompt utilizado: extracto | Resultado final |
| --- | --- | --- | --- |
| Los fallos de conexión y servidor producían mensajes generales. | Detectar el estado y explicar cómo recuperarse. | «Implementa capa compartida de conectividad y errores.» | Estado reactivo, interceptores Axios, mensajes compartidos y bloqueo de escrituras sin red. |
| Las consultas carecían de una copia utilizable ante fallos. | Conservar respuestas válidas sin mezclar sesiones. | «Implementa caché temporal robusta de datos de esta app Angular.» | Caché por sesión con vigencia, validación, respaldo en memoria y avisos de antigüedad. |
| La interfaz no podía recargarse sin Internet. | Descargar previamente sus recursos públicos. | «Implementa soporte BÁSICO de recarga sin conexión en producción para Angular/Ionic: service worker solo estáticos (HTML/JS/CSS/assets), nunca API/auth/datos personales.» | Worker versionado, módulos precargados y recarga offline comprobable. |
| La validación estaba repartida entre HTML y TypeScript. | Centralizar reglas y validar antes de llamar al servidor. | «Implementa núcleo Data Driven/model-driven Angular Reactive Forms para NovaCart.» | Formularios tipados, validadores compartidos, mensajes por campo y pruebas de envíos inválidos. |

Fuentes: [bitácora de conexión](docs/BITACORA_IA_CONEXION.md) y [bitácora Data Driven](docs/ACTIVIDAD_DATA_DRIVEN.md#bitácora-de-apoyo-de-ia). Incluyen problemas adicionales y extractos más amplios.

**Resumen para la actividad:** quería una aplicación Ionic capaz de administrar datos, conservarlos y responder claramente ante fallos. Con ayuda de IA se implementaron navegación protegida, CRUD con MySQL, formularios Data Driven, manejo de errores y consulta offline. Los prompts y las pruebas quedaron documentados. El resultado es una aplicación web reproducible; la entrega de un APK funcional sigue pendiente de configurar y verificar Android.

## 11. Ampliación de diseño y gráficas D3.js

Actualización del 5 de octubre de 2026: se renovaron las cuatro pantallas con navegación compartida para escritorio y móvil, tarjetas de catálogo, avatares, búsquedas locales, resúmenes del carrito, estados sin resultados y controles accesibles para mostrar u ocultar contraseñas.

Carrito incorpora tres gráficas mediante D3.js: precios del catálogo, existencias disponibles y distribución del importe por artículo. Se dibujan con datos de la API o una copia válida; la distribución cambia cuando el servidor confirma una nueva cantidad. Se incluyen estados vacíos y tablas de valores exactos.

La [guía de gráficas](docs/GRAFICAS_D3.md) explica los archivos y el funcionamiento e incluye el objetivo, el prompt y el resultado. El [reporte D3 y diseño](docs/evidencia/d3-verificacion.json) y las [capturas actualizadas](docs/screenshots-diseno/) documentan esta ampliación. Las cifras de la sección 6 corresponden a la entrega inicial del 2 de octubre.

Verificación de esta ampliación: **225 pruebas unitarias, 4 escenarios D3/diseño, 4 escenarios de formularios, 5 escenarios de integración, 7 escenarios de conexión y 6 pruebas del service worker aprobados**. También pasaron lint y la compilación de producción. El [reporte consolidado](docs/evidencia/diseno-d3-verificacion.json) enlaza la evidencia vigente.
