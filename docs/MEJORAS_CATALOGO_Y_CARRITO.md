# Ampliación del catálogo y del carrito

## Objetivo, prompt y resultado

**Qué se quería hacer:** continuar el desarrollo básico de NovaCart para encontrar productos con mayor facilidad y administrar la selección guardada.

**Prompt del usuario:** «continua desaroollando el proyecto».

**Resultado:** la pantalla Carrito permite ordenar por nombre o precio, filtrar productos con existencias o agotados, buscar sin distinguir tildes ni mayúsculas y restablecer los filtros. El orden y la disponibilidad se recuerdan en el navegador. También permite vaciar la selección completa después de una confirmación; el servidor elimina únicamente los artículos de la cuenta conectada.

## Dónde se encuentra el código

| Archivo | Responsabilidad |
| --- | --- |
| [cart.page.ts](../src/app/pages/cart/cart.page.ts) | `filteredProducts` combina búsqueda, disponibilidad y orden sin modificar `products`; `requestClearCart` abre la confirmación y `clearCart` espera la respuesta del servidor. |
| [cart.page.html](../src/app/pages/cart/cart.page.html) | Selectores de orden y disponibilidad, contador de resultados, botón Limpiar filtros, botón Vaciar carrito y diálogo Ionic. |
| [catalog-preferences.ts](../src/app/core/catalog-preferences.ts) | Valida y guarda únicamente las preferencias visuales; recupera valores iniciales si el almacenamiento falla. |
| [cart.service.ts](../src/app/services/cart.service.ts) | `clearCart` envía `DELETE /cart`, valida la respuesta y actualiza la caché de la sesión actual. |
| [cart.php](../server/endpoints/cart.php) | `DELETE /api/cart` borra filas mediante `WHERE user_id = ?`, con el usuario identificado por su token. |
| [design.scss](../src/design.scss) | Presentación adaptable de los controles del catálogo. |

Los empates de precio o nombre se resuelven por identificador. El orden inicial conserva el orden de la API. Las tres gráficas D3 siguen recibiendo `products` e `items` completos: buscar u ocultar artículos en el catálogo no altera los valores de las gráficas.

## Persistencia y errores

`localStorage` conserva la clave `novacart.catalog.preferences.v1`, con un objeto como:

```json
{ "version": 1, "sort": "price-asc", "availability": "available" }
```

La búsqueda no se persiste. Esta preferencia corresponde al navegador y puede compartirse entre cuentas; no contiene productos, datos personales ni credenciales. Si hay JSON inválido, valores desconocidos o almacenamiento bloqueado, la aplicación continúa funcionando. Las preferencias elegidas durante esa visita permanecen en memoria aunque no puedan guardarse.

El carrito continúa persistiendo en MySQL. El vaciado se refleja en el total, los controles de cantidad y la gráfica circular cuando la API confirma el resultado. Si no se confirma, la interfaz conserva la selección anterior y los borradores, muestra un error y pide actualizar antes de volver a guardar. No reintenta el borrado automáticamente.

Sin conexión se puede buscar, ordenar y filtrar la copia válida del catálogo. Vaciar el carrito requiere una conexión disponible y datos consultados nuevamente al servidor. Si la conexión cae mientras está abierta la confirmación, el control vuelve a comprobar el estado antes de enviar la solicitud.

## Prueba reproducible

Con Apache y MySQL activos:

```powershell
npm run deploy:xampp
npm test -- --watch=false
npm run lint
npm run test:api
npm run test:catalog
npm run test:d3
npm run test:offline
```

`test:api` comprueba el backend real usando cuentas temporales y elimina solamente esos registros. `test:catalog` simula las respuestas de la API para comprobar la interfaz con productos disponibles y agotados, sin modificar MySQL; incluye un caso con desconexión real del navegador y recarga mediante el service worker de producción.

Para revisar manualmente, abre `http://localhost/novacart/`, inicia sesión y entra a Carrito. Cambia el orden y la disponibilidad, recarga y verifica que se conservan. Pulsa Limpiar filtros para restaurar el catálogo. Agrega artículos en una cuenta de práctica, pulsa Vaciar carrito y cancela; después confirma y verifica el total cero. Para la consulta offline, carga primero el catálogo y activa Offline en DevTools → Network.

Evidencias: [reporte de catálogo](evidencia/catalogo-verificacion.json) y [capturas de esta ampliación](screenshots-catalogo/).

Comprobaciones realizadas el 5 de octubre de 2026, hora de México:

| Comprobación | Resultado |
| --- | --- |
| Pruebas unitarias | 263 aprobadas en 17 archivos. |
| API PHP/MySQL real | 35 comprobaciones aprobadas, incluyendo vaciado e aislamiento entre cuentas. |
| Catálogo y vaciado con API simulada | 7 escenarios aprobados, incluyendo recarga realmente desconectada. |
| Gráficas D3 | 4 escenarios aprobados. |
| Conexión y consulta offline | 7 escenarios aprobados. |
| Navegador con MySQL | 5 escenarios aprobados. |
| Service worker | 6 pruebas aprobadas. |
| Lint y compilación/despliegue local | Aprobados. |

El [reporte consolidado](evidencia/ampliacion-catalogo-verificacion.json) identifica los reportes automáticos y los resultados observados de los comandos. Las capturas muestran datos de prueba. La fecha UTC de los reportes corresponde al 6 de octubre; la verificación ocurrió el 5 de octubre en `America/Mexico_City`.

## Bitácora del desarrollo asistido por IA

Los prompts técnicos son extractos de las instrucciones usadas para esta ampliación.

| Problema encontrado | Qué se quería que hiciera la IA | Prompt utilizado | Resultado final |
| --- | --- | --- | --- |
| El catálogo solo permitía buscar por texto y no ofrecía orden ni filtro de existencias. | Facilitar encontrar y comparar productos sin alterar los datos de las gráficas. | «Filtro availability all/available/unavailable; orden default/name/price-asc/price-desc, orden estable empate ID, no mutar array products, búsqueda normalizada tildes/mayúsculas/espacios». | Filtros combinables, orden estable, búsqueda normalizada y contador de resultados; D3 conserva el catálogo completo. |
| Las elecciones de presentación se perdían al recargar. | Recordar preferencias y tolerar fallos del almacenamiento. | «Preferencias no sensibles orden/disponibilidad en localStorage key version, validar JSON inválido, capturar storage failure; buscador no persistir ni datos usuarios». | Preferencias versionadas y validadas, valores iniciales ante datos inválidos y continuidad en memoria si no se puede guardar. |
| Para vaciar la selección había que quitar cada artículo; era necesario preservar la separación entre cuentas y el manejo de errores. | Añadir una operación completa con confirmación y respuesta verificada. | «DELETE /api/cart con sesión autenticada debe borrar SOLO user_id actual, devolver CartResponse vacío, idempotente; clearCart usa runSessionMutation scope y confirmCart existente, no retry». | Confirmación Ionic, endpoint por cuenta, total y gráfica actualizados al confirmarse, conservación de datos ante fallos y pruebas de aislamiento entre dos cuentas. |

**Texto resumido para la actividad:** Quería seguir mejorando la aplicación Ionic y hacer más práctico el catálogo y el carrito. Pedí a la IA que continuara el proyecto; se implementaron filtros, orden, búsqueda normalizada, preferencias locales y vaciado del carrito con confirmación. El resultado permite consultar la copia del catálogo sin conexión y mantiene los cambios del carrito sujetos a confirmación del servidor. El código, las pruebas y la bitácora documentan la ampliación.
