> Documento de la version anterior. La entrega vigente usa cuatro pantallas y PHP/MySQL: [guia actual](PROYECTO_SIMPLE.md).

# Prompts relevantes para la entrega de persistencia

**Fecha: 21 de septiembre de 2026.** Este registro reproduce instrucciones reales del usuario. Las explicaciones posteriores describen cómo se atendieron; no son prompts adicionales atribuidos al usuario.

## 1. Solicitud actual: texto literal

```text
ahora haz esto con su respectivo documento
Agregar persistencia para evitar que la información desaparezca al cerrar la aplicación.

Puede utilizarse, según el proyecto:

Ionic Storage.
Preferences.
SQLite.
almacenamiento de archivos.
alguna tecnología equivalente aprobada.
Entregarán:

Aplicación funcional.
Alta, consulta, modificación y eliminación de información persistente.
Video corto demostrando que los datos permanecen después de cerrar/reabrir la aplicación.
Código en repositorio.
Prompts relevantes utilizados durante la implementación.
```

**Aplicación:** se conservó SQLite como persistencia de la API y localStorage para el carrito. Se hizo explícita la sincronización FULL de SQLite y se añadió un aviso con reintento ante fallos al guardar el carrito. Se preparó una prueba con cuatro procesos reales de servidor y cuatro aperturas de navegador, su video y el documento de entrega.

## 2. Contexto anterior: fragmento literal

```text
Diseñar las entidades que utilizará la aplicación e implementar una capa de acceso a datos utilizando servicios de Angular/Ionic.
```

**Aplicación:** se mantuvieron los contratos `User`, `Product`, `ProductInput` y `CartItem`, y los servicios Angular de productos, autenticación y carrito. La persistencia se revisó sobre esas entidades; no se introdujeron tablas de pedidos o pagos que la aplicación no utiliza.

## 3. Consulta técnica utilizada para revisar la configuración

```text
site.sqlite.org pragma synchronous FULL WAL durability commit
```

Esta fue una **consulta de búsqueda**, no un prompt del usuario. Sirvió para contrastar la configuración con la [documentación oficial de SQLite](https://www.sqlite.org/pragma.html#pragma_synchronous). No se presenta la documentación como prueba de cortes de energía; la evidencia del proyecto comprueba cierres y reinicios de procesos.

## Revisión de los resultados de IA

- Se revisaron esquema, servicios, código de almacenamiento y pruebas antes de modificar la app. La persistencia básica ya existía en la entrega anterior.
- Se probaron fallos de escritura del carrito, reintentos y recuperación de cantidades y eliminaciones.
- Se distinguió recargar una página de cerrar completamente navegador y servidor. La demostración usa procesos nuevos y reutiliza los archivos originales de su prueba, sin `storageState` ni reinyección de datos.
- Se corrigieron una espera de navegación y el selector del buscador en el guion automatizado. Las ejecuciones incompletas no son el video de entrega; el informe publicado corresponde a la ejecución completa aprobada.
- Los resultados y límites se registran en [VERIFICACION.md](VERIFICACION.md) y el [informe de persistencia](evidencia/persistencia-verificacion.json).
