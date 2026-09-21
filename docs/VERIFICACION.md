# Verificación de la entrega de NovaCart

**Fecha: 21 de septiembre de 2026.** Resultados ejecutados sobre la aplicación con servicios Angular, API propia y SQLite. El [registro del 11 de septiembre](VERIFICACION_2026-09-11.md) se conserva como antecedente de la versión que utilizaba DummyJSON.

## Resultados actuales

Entorno: Windows, Node.js `24.19.0` y npm `11.19.1`, con las dependencias ya instaladas en el espacio de trabajo.

| Comprobación | Resultado observado |
| --- | --- |
| `npm test -- --watch=false` | 110 pruebas aprobadas en 9 archivos; incluye errores y reintentos del guardado del carrito. |
| `npm run test:api` | 9 pruebas aprobadas; incluye compilación TypeScript del servidor. |
| `npm run lint` | Todos los archivos analizados cumplen las reglas. |
| `npm run build` | Compilación de producción correcta; tamaño inicial de 666,42 kB. |
| `npm run test:e2e` | 18 grupos cubiertos: 17 pasaron en la ejecución general; el CRUD restante pasó después de corregir un selector ambiguo y repetir ese grupo. |
| `node scripts/verify-persistence.mjs --record` | 18 comprobaciones aprobadas en cuatro sesiones con tres reaperturas reales del navegador y servidor. |
| `node scripts/verify-persistence.mjs` | Las mismas 18 comprobaciones aprobadas también en modo sin grabación. |
| Video | MP4 H.264, 1280 × 900, 25 fps y 61,2 segundos; decodificación completa correcta y revisión de fotogramas. |
| Documento PDF | Dos páginas renderizadas con Poppler e inspeccionadas visualmente. |
| `npm run screenshots` | Las siete capturas de `docs/screenshots/` corresponden a la entrega anterior de entidades del mismo día; el video documenta la entrega actual. |

El servidor de las pruebas generales se inició en `http://127.0.0.1:3001` con un archivo SQLite independiente dentro de `artifacts/browser/`, sin modificar la base habitual de `server/data/`. Se estableció `BASE_URL=http://127.0.0.1:3001`. `artifacts/browser/verification.json` registra la ejecución general; `verification-focused.json` registra login y CRUD aprobados después de acotar el título del detalle a un encabezado de nivel 1. Durante una transición Ionic el selector anterior coincidía con los títulos de dos páginas; el fallo era de la automatización.

La prueba de persistencia usa un puerto libre, una base propia y un perfil de navegador en disco, reutilizados entre cuatro sesiones. No usa `storageState` ni inserta datos del carrito por código. El [informe público](evidencia/persistencia-verificacion.json) registra los 18 resultados, cierres, procesos y hash SHA-256 del [video](videos/persistencia-novacart.mp4). Las grabaciones finalizaron el `2026-09-21T23:40:14.044Z`. Se probaron altas, cambios de precio y stock, cantidades del carrito y borrados después de terminar procesos, además de leer la base con la API detenida y ejecutar `PRAGMA integrity_check`.

## Modelo, servicios y CRUD comprobados

- La API crea un producto con identificador propio, lo consulta, actualiza precio y existencias, lo conserva al reiniciar SQLite y permite eliminarlo. Consultarlo después del borrado devuelve `404`.
- Vaciar el catálogo y reiniciar no repone los productos eliminados. La inicialización se realiza una vez por base de datos.
- Se comprobaron claves foráneas, autor del producto, precios en centavos y restricciones de existencias. Contraseñas y tokens no se guardan en texto plano en las tablas.
- Se rechazaron escrituras sin autenticación, sesiones falsificadas, vencidas o revocadas, JSON incorrecto y campos inválidos.
- El formulario de Angular valida texto, precio, existencias e imágenes. Se corrigieron diferencias con la API en rutas de imagen, longitudes tras quitar espacios y caracteres de control.
- En navegador se recorrieron crear, consultar, editar, recargar y eliminar desde Inventario. Se comprobó que los errores del servidor conservan el formulario y no anuncian un guardado inexistente.
- Se contrastaron esquema SQL, interfaces TypeScript, métodos públicos de los servicios y diagramas de [MODELO_DATOS.md](MODELO_DATOS.md) y [SERVICIOS_DATOS.md](SERVICIOS_DATOS.md).

## Comprobaciones de la interfaz

Los 18 grupos incluyen rutas protegidas, login, búsqueda, detalle, navegación, carrito, compra simulada, perfil, cierre de sesión, respaldo de catálogo, errores de red y HTTP, almacenamiento inválido, CRUD y presentación responsive. Se añadió un escenario que bloquea la escritura del carrito, comprueba el aviso, restaura el almacenamiento y verifica las cantidades después del reintento y recarga. Los fallos controlados se inyectan únicamente en las pruebas que los necesitan; la grabación de persistencia no usa esas inyecciones.

Se verificó ausencia de desbordamiento horizontal a 390, 768 y 1440 píxeles en seis vistas y el formulario de inventario. También se inspeccionaron visualmente las capturas del formulario a 390 píxeles y del inventario a 1440 píxeles. Las siete capturas de entrega se generaron a 1440 × 1200 con la API SQLite real.

## Reproducir

```bash
npm ci
npm test -- --watch=false
npm run test:api
npm run lint
npm run build
npm run dev
```

Con la app en ejecución, desde otra terminal:

```bash
npm run test:e2e
npm run screenshots
```

Por defecto, los scripts usan `http://localhost:8100`. El [README](../README.md) explica cómo iniciar sesión y recorrer el CRUD manualmente.

## Límites del registro

En esta revisión no se repitieron la instalación en un checkout limpio ni una auditoría de dependencias; no se trasladan esos resultados de la verificación histórica a esta entrega. Las pruebas se limitaron al navegador de escritorio automatizado y a las anchuras indicadas, sin ejecución nativa en Android o iOS.

El carrito es local y la compra es una simulación: no crea pedidos, procesa cobros ni descuenta existencias. El CRUD completo corresponde a productos; los usuarios no tienen formulario público de alta, edición o eliminación. Los archivos SQLite, claves de sesión, compilados y diagnósticos locales están excluidos de Git.
