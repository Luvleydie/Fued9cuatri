> Documento de la version anterior. La entrega vigente usa cuatro pantallas y PHP/MySQL: [guia actual](PROYECTO_SIMPLE.md).

# Persistencia de información

**NovaCart | Angular e Ionic | 21 de septiembre de 2026**

## Objetivo y tecnología

Conservar la información guardada después de cerrar y reabrir la aplicación. Se utiliza **SQLite en archivo** para los productos, usuarios y sesiones. El carrito se conserva con **localStorage** en el perfil del navegador. Ambas tecnologías ya formaban parte de la app; esta entrega refuerza el guardado, incorpora recuperación ante errores y demuestra su funcionamiento con procesos nuevos.

| Información | Ubicación y recuperación |
| --- | --- |
| Productos, usuarios y sesiones | `server/data/novacart.sqlite`. La API abre el mismo archivo al iniciar. |
| Clave de firma de las sesiones | Archivo `.sqlite.secret` junto a la base. Permite verificar sesiones aún vigentes después de reiniciar. |
| Carrito | Clave `novacart.cart` del navegador. `CartService` restaura productos y cantidades al iniciar. |
| Perfil y token | `novacart.user` y `novacart.accessToken`. Una sesión vencida requiere iniciar sesión nuevamente; no borra productos ni carrito. |

Las páginas Ionic inyectan `ProductsService`, que envía las operaciones a la API; `Store` ejecuta consultas SQL parametrizadas. El carrito utiliza `CartService`. El esquema se inicializa una sola vez y no vuelve a insertar productos eliminados al reiniciar.

## Alta, consulta, modificación y eliminación

| Operación | Productos en Gestión (Inventario) | Carrito local |
| --- | --- | --- |
| Alta | Nuevo producto; `POST /api/products`. | Agregar al carrito. |
| Consulta | Listado y detalle; `GET /api/products`. | Restaurar y mostrar artículos. |
| Modificación | Editar y guardar; `PUT /api/products/:id`. | Aumentar o disminuir cantidades. |
| Eliminación | Confirmar borrado; `DELETE /api/products/:id`. | Eliminar una línea o vaciar. |

Cada escritura se guarda al realizar la operación; no se espera al cierre de la ventana. SQLite usa WAL y se configura explícitamente `synchronous=FULL` en cada conexión de la API. Esta configuración solicita sincronización del registro al confirmar una transacción, conforme a la [documentación de SQLite](https://www.sqlite.org/pragma.html#pragma_synchronous).

Si falla la API, no se anuncia un guardado correcto y el formulario conserva sus datos. Si falla el guardado del carrito, se muestra un aviso y **Reintentar guardado**. El aviso desaparece cuando la escritura funciona. Los archivos de ejecución y los tokens se excluyen de Git.

<!-- salto-de-pagina -->

## Video y comprobación de reapertura

El [video de demostración](videos/persistencia-novacart.mp4) dura **61 segundos**, con rótulos en español y sin audio. Une cuatro grabaciones reales en orden. Las transiciones identifican el cierre del navegador y la terminación del servidor antes de iniciar los siguientes procesos. No se reinyectan productos, tokens ni carrito.

| Momento aproximado | Evidencia |
| --- | --- |
| 00:04 | Alta de Café de Oaxaca: precio 129.90, stock 8; dos unidades en el carrito. |
| 00:20 | Primera reapertura: datos restaurados. Se cambia nombre, precio a 149.50, stock a 11 y carrito a tres unidades. |
| 00:36 | Segunda reapertura: edición conservada. Se elimina el producto y su línea del carrito. |
| 00:49 | Tercera reapertura: inventario sin el producto, detalle inexistente y carrito vacío. |

La prueba usa una base aislada y un perfil de navegador propios dentro de `artifacts/persistence/`. Reutiliza esos mismos archivos entre las cuatro sesiones. También consulta SQLite cuando el servidor ya está detenido y comprueba su integridad. El [informe de evidencia](evidencia/persistencia-verificacion.json) registra las comprobaciones, los procesos, las fechas y el hash del video.

## Ejecutar y reproducir

Para usar la aplicación: `npm ci` y `npm run dev`; abrir `http://localhost:8100`, usar la cuenta de demostración y entrar en **Gestión**. Cerrar navegador y servidor, volver a ejecutar el mismo comando y abrir la misma dirección con el mismo perfil.

Para compilar y comprobar los cierres automáticamente: `npm run test:persistence`. Para generar el video se necesita Python y ejecutar:

```bash
python -m pip install -r scripts/requirements-delivery.txt
npx playwright install ffmpeg
npm run video:persistence
```

Los scripts utilizan Chrome instalado; admiten Chromium de Playwright como alternativa. Si falta, instalarlo con `npx playwright install chromium`.

## Prompts, cambios y alcance

La instrucción principal fue: **“Agregar persistencia para evitar que la información desaparezca al cerrar la aplicación.”** Se utilizó junto con la solicitud previa de entidades, servicios Angular/Ionic y CRUD. El [registro de prompts](PROMPTS_PERSISTENCIA.md) conserva los textos reales y explica cómo orientaron la revisión, el aviso de guardado y la prueba de cierre; no presenta prompts reconstruidos como conversaciones reales.

Los productos requieren la API en ejecución. El carrito depende del mismo origen y perfil: borrar los datos del navegador también borra esa copia. Las líneas del carrito mantienen el precio y nombre copiados al agregarlas. La compra es simulada. Se verificaron cierres de procesos en Windows; no se probaron cortes de energía ni ejecución nativa en Android o iOS. Esta entrega no añade un modo de inventario sin conexión.

Código: [Luvleydie/Fued9cuatri](https://github.com/Luvleydie/Fued9cuatri). Resultados de pruebas: [VERIFICACION.md](VERIFICACION.md).
