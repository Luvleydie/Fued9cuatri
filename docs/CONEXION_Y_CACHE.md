# Conexión, errores y funcionamiento sin red

NovaCart permite consultar la última información cargada cuando se pierde la conexión o la API falla. Los cambios requieren conexión y confirmación del servidor.

## Estrategia implementada

| Necesidad | Comportamiento |
| --- | --- |
| Detectar conexión | `navigator.onLine` y eventos `online`/`offline` actualizan un aviso en las cuatro pantallas. Las respuestas de Axios permiten distinguir una red disponible de un servicio inaccesible. |
| Manejar errores | Axios conserva un límite de 15 segundos. Se distinguen desconexión, timeout, errores HTTP, datos inválidos y sesión vencida. Los indicadores de carga se liberan al terminar. |
| Informar al usuario | Mensajes en español, avisos accesibles, fecha de la copia temporal y botón **Actualizar**. Un fallo de consulta no se presenta como un carrito vacío confirmado. |
| Almacenamiento temporal | Primero se consulta la red. Usuarios, productos y carrito se guardan en `sessionStorage`; si falla la escritura de caché, se conserva una copia en memoria. |
| Recuperar conexión | El aviso cambia automáticamente. Cuando se utiliza una copia temporal, el usuario pulsa **Actualizar** para comprobar la API y volver a habilitar cambios con datos actuales. No se reenvían operaciones pendientes. |
| Recargar sin red | En producción, un service worker conserva el HTML, los estilos, los scripts y recursos públicos de la aplicación. También permite navegar entre sus pantallas sin descargar módulos adicionales. |

La indicación del navegador no garantiza acceso a Internet, Apache o MySQL. Por eso se observan además los errores de las solicitudes reales. No se realizan comprobaciones periódicas ni reintentos automáticos.

## Reglas de la caché

- Vigencia máxima: **una hora**, además del vencimiento de la sesión existente.
- Separación mediante un identificador de sesión; se limpia al cerrar sesión, iniciar otra sesión o detectar que la sesión expiró.
- Se valida la estructura de los datos y se conservan únicamente los campos previstos. Las contraseñas y las credenciales de las respuestas no se copian en esta caché.
- Solo se utiliza una copia ante desconexión, timeout, fallo de red o HTTP 5xx. Un 401, 403, 404 u otro error no recuperable no se oculta con datos guardados.
- Las escrituras confirmadas invalidan o reemplazan la copia correspondiente. Una consulta tardía no debe volver a guardar datos de una sesión anterior.
- La copia en memoria se pierde al recargar. Se muestra una advertencia si no fue posible conservarla en `sessionStorage`.
- Sin una copia válida, se muestra el error y se solicita reconectar. No se inventan registros ni cantidades.

Al mostrar datos de caché, los controles de escritura permanecen bloqueados hasta actualizar con éxito. Si una escritura pierde su respuesta, se conserva el formulario o el carrito previo y se pide actualizar: el servidor podría haber procesado la operación antes de perderse la conexión.

El inicio de sesión y el registro necesitan red. Los formularios no se guardan como borradores persistentes. Cerrar sesión sin red elimina la sesión y los datos locales; la sesión del servidor conserva su vencimiento normal si no se pudo enviar el cierre.

## Probar manualmente

1. Activa Apache y MySQL y ejecuta `npm run deploy:xampp`.
2. Abre `http://localhost/novacart/`. Inicia sesión con la cuenta demo `emilys / emilyspass`.
3. Visita **Usuarios** y **Carrito**. Comprueba que aparecen los datos y la fecha de actualización.
4. Espera a que el service worker esté activado en DevTools → Application → Service Workers. Para comprobarlo en consola: `await navigator.serviceWorker.ready; Boolean(navigator.serviceWorker.controller)` debe resultar `true`.
5. En DevTools → Network elige **Offline**. Pulsa **Actualizar**: se muestran los últimos datos guardados, el aviso de copia temporal y los controles de escritura deshabilitados.
6. Recarga la pestaña y navega entre Usuarios y Carrito. La interfaz y las copias disponibles deben seguir apareciendo.
7. Regresa a **No throttling** y pulsa **Actualizar**. Se consulta nuevamente la API y se habilitan los controles tras una respuesta válida.
8. Para comprobar el caso sin copia, elimina solo las claves `novacart.data.v1.*` en Session Storage, mantén la red desactivada y recarga. Debe aparecer el mensaje de falta de copia temporal, sin datos inventados.

Para simular fallos del servidor sin detener ni modificar MySQL, ejecuta las pruebas automatizadas. Estas interceptan respuestas 503 y 401 únicamente en sus propios contextos del navegador.

## Comprobaciones automatizadas

```powershell
npm test -- --watch=false
npm run lint
npm run test:offline-shell
npm run deploy:xampp
npm run test:offline
npm run test:e2e
```

La prueba de navegador requiere Chrome/Chromium, Apache, MySQL y la aplicación de producción instalada. Sus resultados se guardan en [conexion-verificacion.json](evidencia/conexion-verificacion.json). Las capturas se guardan en `docs/screenshots-conexion/`.

### Resultado de la prueba sin conexión

Ejecución del 29 de septiembre de 2026: **7 de 7 escenarios aprobados** en Chrome, con la red desactivada mediante `BrowserContext.setOffline(true)`. Se comprobó recarga y navegación sin red, recuperación, HTTP 503 con copia válida, ausencia de copia, HTTP 401, almacenamiento sin espacio y una escritura sin confirmación que se envió una sola vez. No se encontraron respuestas de API en la caché del service worker.

**Repetición del 2 de octubre de 2026:** los 7 escenarios volvieron a aprobarse con los formularios Data Driven. El JSON y las capturas enlazados muestran esta ejecución más reciente. El [documento de entrega](../ENTREGA_PROYECTO_IONIC.md) reúne también los resultados actuales de API, integración y pruebas unitarias.

| Evidencia visual | Qué demuestra |
| --- | --- |
| [Carrito sin conexión](screenshots-conexion/01-carrito-sin-conexion.png) | Consulta de datos guardados y acciones deshabilitadas. |
| [Vista móvil](screenshots-conexion/01-carrito-sin-conexion-movil.png) | Avisos legibles a 390 px, sin desbordamiento horizontal. |
| [Usuarios tras recargar](screenshots-conexion/02-usuarios-recarga-sin-conexion.png) | La interfaz y la copia sobreviven a una recarga sin red. |
| [Servicio no disponible](screenshots-conexion/03-servicio-no-disponible.png) | Fallo 503 con recuperación desde caché. |
| [Sin copia previa](screenshots-conexion/04-sin-copia-disponible.png) | Mensaje explícito sin inventar un carrito vacío. |
| [Sesión vencida](screenshots-conexion/05-sesion-vencida.png) | Solicitud de autenticación después de limpiar la sesión y su copia. |
| [Respaldo en memoria](screenshots-conexion/06-almacenamiento-en-memoria.png) | Advertencia cuando la copia se perderá al recargar. |
| [Escritura no confirmada](screenshots-conexion/07-escritura-no-confirmada.png) | Formulario conservado y actualización requerida antes de reintentar. |
| [Registro sin red](screenshots-conexion/08-registro-sin-conexion.png) | Registro bloqueado hasta recuperar la conexión. |

Además, pasaron **106 pruebas unitarias**, **6 pruebas del service worker**, la revisión de estilo y la compilación de producción. La [regresión de navegador](evidencia/regresion-conexion.json) aprobó sus **5 escenarios**: rutas protegidas, registro, CRUD de usuarios, persistencia del carrito y cuatro pantallas a 390, 768 y 1440 px.

## Límites

La primera visita necesita red y debe terminar la instalación de recursos; no se puede abrir por primera vez una aplicación que nunca se descargó. La recarga sin red se habilita en producción sobre HTTPS o localhost, no con `ng serve`. Una pestaña nueva necesita su propia sesión y volver a iniciar sesión requiere conexión. El navegador puede eliminar su almacenamiento.

El service worker excluye API, autenticación y respuestas con Authorization. Solo almacena archivos públicos generados por el build. Las actualizaciones de la aplicación se activan al cerrar sus pestañas y volver a abrirla, para mantener el HTML y sus módulos en la misma versión.

## Archivos principales

- `src/app/core/api/connection-state.ts`: estado reactivo de red y servicio.
- `src/app/core/api/axios-client.ts` y `api-errors.ts`: solicitudes y errores compartidos.
- `src/app/core/api/data-cache.ts`, `data-projections.ts` y `session-storage.ts`: copias, validación y limpieza.
- `src/app/core/connection-notice.component.ts` y `cache-notice.ts`: avisos de estado y fecha.
- `src/app/services/`: consultas con caché y mutaciones confirmadas.
- `scripts/build-offline.mjs` y `src/main.ts`: generación y registro del service worker.
- [Bitácora del apoyo de IA](BITACORA_IA_CONEXION.md).
