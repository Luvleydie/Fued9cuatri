# Bitácora de problemas resueltos con ayuda de IA

Fecha: 29 de septiembre de 2026. Proyecto: NovaCart. Asistente: Codex.

Esta bitácora describe problemas encontrados al revisar el código y las soluciones implementadas en esta sesión. Los prompts de cada apartado son extractos literales de las instrucciones usadas para delegar el trabajo a agentes de IA; no representan conversaciones anteriores inventadas.

## Solicitud original

> Implementar una estrategia básica para que la aplicación pueda reaccionar ante problemas de conexión o fallos en el acceso a los datos.
> Detección de estado de conexión.
> Manejo de errores.
> Mensajes adecuados al usuario.
> Estrategia de caché o almacenamiento temporal.
> Prueba de funcionamiento sin conexión.
> Bitácora con al menos tres problemas encontrados y cómo fueron solucionado con ayuda de IA. decir que queria que hiciera la IA, cual fue el prompt y cual fue el resultado final

## Problema 1: la aplicación no distinguía desconexión, timeout y fallo del servidor

**Qué se encontró.** El cliente Axios tenía timeout y enviaba el token, pero no observaba el estado de red. Las páginas repetían mensajes generales y podían mostrar directamente el mensaje del servidor. El usuario no sabía si debía reconectar, corregir datos o iniciar sesión de nuevo.

**Qué quería que hiciera la IA.** Crear una solución común para detectar la desconexión, clasificar los errores y dar mensajes útiles sin mostrar detalles técnicos del servidor ni duplicar escrituras.

**Prompt utilizado, extracto literal:**

> Implementa capa compartida de conectividad y errores.
> Axios rechaza pronto solicitudes si offline (OfflineError) y observa respuestas: red/timeout/5xx indisponibilidad, respuesta alcanzable normal o 4xx recupera API. Mantener timeout 15000. No reintentar escrituras.
> Mensaje de mutación red/timeout/5xx debe indicar que no se pudo confirmar y actualizar antes de reintentar; mensajes seguros status 401,403,404,409,422,429 y servidor 5xx sin crudos técnicos (mensajes válidos de 4xx preservables).

**Cómo se solucionó.** Se añadieron señales reactivas de conexión y disponibilidad de API, interceptores Axios y una función compartida de mensajes. Las cuatro pantallas muestran el estado. Los cambios quedan bloqueados al desconectarse; una respuesta incierta pide actualizar antes de reintentar.

**Resultado final.** La pérdida de red se detecta sin esperar el timeout; un servidor inaccesible se comunica por separado. Las pruebas comprueban eventos online/offline, timeout, errores HTTP, bloqueo de solicitudes offline y ausencia de reintentos automáticos.

## Problema 2: las consultas no tenían una copia utilizable ante fallos

**Qué se encontró.** `UsersService` y `CartService` devolvían únicamente la respuesta de la API. Si fallaba la consulta, no había almacenamiento temporal. Añadir una caché general sin separar sesiones también habría permitido mezclar datos entre cuentas o conservar información inválida.

**Qué quería que hiciera la IA.** Conservar temporalmente la última respuesta válida y recuperarla de forma controlada, indicando su antigüedad y limpiándola cuando cambia la sesión.

**Prompt utilizado, extracto literal:**

> Implementa caché temporal robusta de datos de esta app Angular.
> Cache network-first, sessionStorage y fallback memoria si storage falla, TTL 1h, campos validados/proyectados sin credenciales, aislada por sesión/usuario, limpiada por clearSession, evita cache tardía tras logout/cambio sesión, no usar cache frente a 401/403/404 ni datos malformados.
> Añade tests para fallback, corrupta, expirada, aislamiento, storage bloqueado y mutaciones.

**Cómo se solucionó.** Se creó una caché con una hora de vigencia, un identificador por sesión y validación de usuarios, productos y carrito. Se consulta primero la red y solo se recupera una copia ante errores recuperables. Las escrituras confirmadas actualizan o invalidan los datos guardados. Las pantallas muestran fecha, advertencia de posible desactualización y modo de consulta.

**Resultado final.** Los últimos datos válidos pueden consultarse sin red; una copia ausente, corrupta, vencida o perteneciente a otra sesión no se presenta como información actual. Si falla guardar la caché, la respuesta de red sigue siendo útil y se conserva en memoria mientras la página permanece abierta.

## Problema 3: recargar sin Internet impedía abrir la interfaz

**Qué se encontró.** El proyecto generaba los archivos Angular, pero no instalaba un service worker. Una caché de datos por sí sola no permite descargar el HTML, los estilos ni los módulos de las pantallas cuando se recarga sin conexión.

**Qué quería que hiciera la IA.** Permitir recargar y navegar por la aplicación previamente descargada, conservando únicamente recursos públicos y dejando los datos de cuenta en la caché de sesión.

**Prompt utilizado, extracto literal:**

> Implementa soporte BÁSICO de recarga sin conexión en producción para Angular/Ionic: service worker solo estáticos (HTML/JS/CSS/assets), nunca API/auth/datos personales.
> Debe funcionar /novacart/ y /, servir rutas SPA al navegar offline, precache módulos lazy para ir a home/cart offline tras instalar; no registrar en dev. Instalación failure no rompe app. Evitar borrar caches ajenas. Requiere HTTPS o localhost.

**Cómo se solucionó.** Cada build genera un worker con un manifiesto de archivos públicos y una versión calculada por hash. Se registra en producción y guarda la interfaz completa, incluidos módulos de carga diferida. Las respuestas de API y las solicitudes con Authorization quedan excluidas.

**Resultado final.** Tras una primera visita con instalación completa, la aplicación puede recargarse sin conexión. Las pruebas del worker verifican instalación, versiones, rutas, exclusión de API y preservación de cachés ajenas. La prueba en navegador verifica la recarga con la red efectivamente desactivada.

## Problema 4: una respuesta tardía podía afectar otra sesión

**Qué se encontró.** En la revisión de la solución, se detectó que una escritura pendiente de la cuenta A podía responder con HTTP 401 después de entrar con la cuenta B. Comprobar únicamente las respuestas exitosas no protegía el camino de error: la pantalla podía cerrar la sesión nueva.

**Qué quería que hiciera la IA.** Revisar también los errores de las operaciones pendientes y evitar que una respuesta de otra sesión modificara o cerrara la sesión actual.

**Prompt utilizado, extracto literal:**

> Revisión offline_shell detectó bug: ya vi que añades chequeo de éxito sesión, pero rechazos tardíos mutaciones deben checar scope en catch y convertir 401 viejo en SessionChangedError para no borrar nueva sesión desde página cart oculta. Caso PUT A lento -> ir home -> logout -> login B -> rechaza PUT A 401. Añade protección y test.

**Cómo se solucionó.** Se añadió una comprobación del identificador de sesión tanto al resolver como al rechazar las escrituras. Una respuesta de una sesión anterior se convierte en un error de cambio de sesión y no se trata como un 401 de la nueva cuenta.

**Resultado final.** Cinco pruebas reproducen respuestas 401 tardías para crear, editar y eliminar usuarios, cambiar cantidades y quitar artículos. En todas, la cuenta nueva se conserva y la respuesta anterior no contamina su caché. Este hallazgo también muestra por qué fue necesario revisar y probar el código propuesto por la IA.

## Evidencia y reproducción

Los resultados reales de las pruebas de navegador se registran en [conexion-verificacion.json](evidencia/conexion-verificacion.json), con fecha, escenario y resultado. La [guía de conexión y caché](CONEXION_Y_CACHE.md) contiene los comandos y la prueba manual. El código de las pruebas queda en el repositorio para poder repetir la verificación.

Resultado final: **106 pruebas unitarias, 6 pruebas del service worker, 7 escenarios de conexión y 5 escenarios de regresión aprobados**. También pasaron la compilación de producción y la revisión de estilo. Durante las pruebas se ajustaron selectores para las transiciones de Ionic y se esperó la carga inicial antes de simular un 401, evitando confundir errores de sincronización de las pruebas con fallos de la aplicación.

La IA produjo código, pruebas y documentación. La validación se realizó ejecutando los comandos y revisando sus resultados; los prompts por sí solos no constituyen evidencia de funcionamiento.

Actualización del 2 de octubre de 2026: se repitieron los 7 escenarios sin conexión después de incorporar formularios reactivos y volvieron a aprobarse. Las evidencias enlazadas contienen la ejecución más reciente; las cifras de 106 pruebas anteriores describen la etapa inicial. La entrega actual incluye 208 pruebas unitarias y se detalla en [ENTREGA_PROYECTO_IONIC.md](../ENTREGA_PROYECTO_IONIC.md).
