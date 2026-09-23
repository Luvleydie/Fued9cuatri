> Documento de la version anterior. La entrega vigente usa cuatro pantallas y PHP/MySQL: [guia actual](PROYECTO_SIMPLE.md).

# Evidencia de uso de Inteligencia Artificial

**Registro reconstruido de instrucciones de IA utilizadas durante las etapas del desarrollo.**

El desarrollo partió de una instrucción maestra y un plan aprobado. Los siguientes prompts resumen tareas realmente realizadas con apoyo de IA; no son transcripciones ni capturas literales de conversaciones independientes. El código fuente, las pruebas y el historial del repositorio permiten revisar los resultados.

## Prompt 1 — Proyecto y arquitectura

> Crea NovaCart con el starter oficial blank de Ionic y Angular basado en NgModules. Conserva AppModule y crea módulos para login, catálogo, detalle, carrito y perfil. Adapta la configuración a las versiones instaladas.

**Objetivo:** establecer una aplicación Ionic modular que pueda ejecutarse en el entorno disponible.

**Resultado:** se utilizó el starter oficial con Angular 22 e Ionic 9. Se mantuvieron `AppModule`, `AppRoutingModule`, `standalone: false` y los imports desde `@ionic/angular/lazy`. Las vistas incorporan signals para actualizar estado en la configuración sin Zone.js del starter.

**Decisión sobre el código:** se aceptó la base de NgModules. La Home de bienvenida del starter se sustituyó por el catálogo académico. No se generó ni se descartó una arquitectura standalone durante este proceso.

**Incidencias reales:** el intento inicial de `ionic start` falló con `ECONNRESET` al descargar la plantilla. Se descargó el mismo archivo oficial mediante PowerShell y se extrajo su contenido. npm 11.2.0 falló posteriormente con un error de Arborist relacionado con `edgesOut`; después de actualizar npm a 11.19.1, la instalación terminó correctamente.

## Prompt 2 — Axios y autenticación

> Centraliza las peticiones en Axios, usa DummyJSON para iniciar sesión y agrega el token Bearer con un interceptor. Conserva la sesión al recargar y protege las rutas privadas. Guarda únicamente los datos necesarios del usuario.

**Objetivo:** utilizar autenticación real y evitar repetir configuración de red en las páginas.

**Resultado:** se creó una instancia Axios con `baseURL`, encabezados JSON y timeout de 15 segundos. `AuthService` realiza login, logout y consulta de perfil; los guards verifican la sesión. El almacenamiento utiliza `novacart.accessToken` y `novacart.user`.

**Decisión sobre el código:** se utilizó el campo real `accessToken`. El modelo también representa `refreshToken`, aunque la aplicación no lo persiste ni implementa renovación automática. La respuesta de `/auth/me` contiene campos ajenos al perfil, incluida una contraseña de demostración; por ello se implementó `toUser` como proyección explícita. No se utilizó HttpClient ni un login simulado.

Archivos principales: [cliente Axios](../src/app/core/api/axios-client.ts), [gestión de sesión](../src/app/core/api/session-storage.ts) y [AuthService](../src/app/services/auth.service.ts).

## Prompt 3 — Modelos, catálogo y búsqueda

> Define Product, User, AuthResponse y CartItem de acuerdo con DummyJSON. Muestra los productos con tarjetas Ionic y permite buscar por título, categoría y marca. Incluye estados de carga, error y resultados vacíos.

**Objetivo:** separar contratos de datos, acceso a la API y presentación del catálogo.

**Resultado:** se crearon las interfaces TypeScript y `ProductsService`. El catálogo utiliza una cuadrícula adaptable y filtra localmente por los tres campos, admitiendo una marca ausente.

**Decisión sobre el código:** se consultó `/products?limit=0` para que la búsqueda incluya todo el catálogo; usar el listado predeterminado limitaría los resultados a la primera página. Se preparó un respaldo de seis productos consultados en la API con imágenes locales. El servicio identifica su procedencia mediante `source: 'api' | 'local'` y sólo activa el respaldo ante fallos de conexión o del servidor.

Archivos principales: [modelos](../src/app/models), [ProductsService](../src/app/services/products.service.ts) y [datos de respaldo](../src/app/data/mock-products.ts).

## Prompt 4 — Detalle y carrito persistente

> Implementa el detalle de producto y un carrito local para agregar, eliminar y modificar cantidades. Respeta el stock, calcula importes con dos decimales y conserva el carrito al recargar. La finalización debe ser una simulación con Ionic Alert.

**Objetivo:** completar el recorrido de selección sin implementar pagos reales ni una API de carrito.

**Resultado:** el detalle consulta el identificador indicado y maneja productos inexistentes. `CartService` expone señales para las líneas y el contador, agrupa productos repetidos, limita cantidades y restaura datos de `localStorage`. La vista muestra precio unitario, subtotal y total.

**Decisión sobre el código:** los cálculos monetarios se realizan en centavos; el descuento de la API se presenta como información. Se validan los datos restaurados para que JSON corrupto o cantidades inválidas no rompan la aplicación. Vaciar requiere confirmación y la compra simulada limpia el carrito al aceptar el resultado. Un error 404 no activa un producto de respaldo.

Archivos principales: [CartService](../src/app/services/cart.service.ts), [vista de carrito](../src/app/pages/cart) y [detalle](../src/app/pages/product-detail).

## Prompt 5 — Perfil y presentación responsive

> Construye el perfil con los datos de /auth/me y acción para cerrar sesión. Unifica la presentación de las páginas con una paleta azul y morada, componentes Ionic, estados comprensibles y controles accesibles en teléfono, tablet y escritorio.

**Objetivo:** mantener una experiencia visual coherente y dar acceso a los datos de sesión.

**Resultado:** se implementó el perfil con carga, error y reintento, además de su acción de logout. Las páginas incluyen estilos adaptables y etiquetas en sus acciones; el carrito distingue selección y resumen de compra.

**Decisión sobre el código:** se utilizaron componentes Ionic y CSS propios sobre la estructura modular. En el carrito se modificó la ruta inicialmente usada para el placeholder de imagen: `assets/product-placeholder.svg` pasó a `assets/products/product-placeholder.svg`, alineándola con el recurso realmente creado para productos. Es una corrección concreta de integración, no una sustitución del motor de interfaz.

La revisión de capturas detectó que el título del catálogo heredaba un color oscuro sobre el fondo morado. Se fijó el color blanco en `.catalog-hero h1` y se ampliaron los botones de las tarjetas a 44 px en móvil para facilitar su uso táctil.

Archivos principales: [perfil](../src/app/pages/profile), [estilos de carrito](../src/app/pages/cart/cart.page.scss) y [placeholder local](../src/assets/products/product-placeholder.svg).

## Prompt 6 — Pruebas y documentación académica

> Prepara pruebas de autenticación, protección de rutas, respaldo y carrito. Documenta las interfaces y reconstruye las instrucciones realmente utilizadas, distinguiendo código aceptado, modificado y descartado. Registra los resultados de verificación sin inventar evidencia.

**Objetivo:** hacer revisable el funcionamiento y explicar las decisiones tomadas durante el desarrollo asistido por IA.

**Resultado:** se añadieron pruebas Vitest para los servicios y la sesión; se redactaron este registro y el [modelo de datos](MODELO_DATOS.md). Las pruebas del carrito cubren persistencia, stock, cantidades inválidas, aritmética monetaria y almacenamiento bloqueado.

**Decisión sobre el código:** se eligieron escenarios que comprueban comportamiento observable, como obtener exactamente `0.30` al sumar `0.10` y `0.20`, conservar cantidades al recargar y recuperar un carrito vacío de un JSON inválido. La ejecución final de pruebas, las capturas y la publicación se registran por separado una vez verificadas.

## Evaluación del código generado por IA

| Tipo | Ejemplo real y motivo |
| --- | --- |
| Aceptado | Estructura `AppModule` del starter y modelos `Product`, `User`, `AuthResponse` y `CartItem`, utilizados como base de la aplicación modular. |
| Aceptado | Operaciones del carrito con signals y conversión a centavos, integradas para persistencia y actualización de cantidades. |
| Modificado | Configuración del starter y composición de las páginas para convertir la aplicación blank en NovaCart; se mantuvieron los imports de Ionic 9 y el arranque mediante módulos. |
| Modificado | Ruta del placeholder del carrito, ajustada a `assets/products/product-placeholder.svg` para coincidir con el asset compartido. |
| Modificado | Color del título del catálogo y tamaño de sus botones después de revisar capturas reales en teléfono y escritorio. |
| Modificado | Selectores Playwright: los botones Ionic con `routerLink` se identifican como enlaces; las pruebas esperan a que termine el cierre de un Alert antes de abrir otro. |
| Descartado | Contenido y vista de bienvenida estándar de la Home blank, reemplazados por el catálogo con búsqueda y tarjetas de productos. |

Ejemplo aceptado de [CartItem](../src/app/models/cart-item.model.ts):

```typescript
export interface CartItem {
  product: Product;
  quantity: number;
}
```

Ejemplo de manejo monetario de [CartService](../src/app/services/cart.service.ts):

```typescript
private unitCents(product: Product): number {
  return Math.round((product.price + Number.EPSILON) * 100);
}

getSubtotal(item: CartItem): number {
  return (this.unitCents(item.product) * item.quantity) / 100;
}
```

Las decisiones sobre `accessToken`, la proyección de usuario, `limit=0` y el respaldo restringido a errores de conexión o 5xx se adoptaron al implementar los servicios. No se atribuyen a versiones anteriores de código que no existieron.

## Registro de verificación

Las pruebas unitarias de la aplicación integrada aprobaron **51 casos en 7 archivos**; `npm run lint` también terminó correctamente. Se comprobó el login con DummyJSON, el perfil y el catálogo reales, además de errores controlados y tamaños de pantalla de 390, 768 y 1440 px.

La primera ejecución del navegador detectó dos aserciones incorrectas del script (rol de enlace y cierre animado de Alert). Se corrigieron y reejecutaron los escenarios afectados. Estas incidencias no se ocultaron ni se presentaron como errores de la aplicación. El resumen definitivo y la reproducción desde un checkout limpio se documentan en [VERIFICACION.md](VERIFICACION.md).

Como complemento, [PROMPTS_DESARROLLO.md](PROMPTS_DESARROLLO.md) ofrece una versión breve con **prompt, objetivo y resultado final**, solicitada posteriormente.
