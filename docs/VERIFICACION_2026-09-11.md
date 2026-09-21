# Verificación de NovaCart

Pruebas realizadas el 11 de septiembre de 2026, hora de Ciudad de México (12 de septiembre en los informes UTC). Los resultados reflejan comprobaciones ejecutadas, no sólo inspección de archivos.

## Comprobaciones realizadas

| Comprobación | Resultado |
| --- | --- |
| Instalación de dependencias | Correcta con npm 11.19.1; versiones registradas en el README y lockfile. |
| Compilación por etapas | `ionic build` correcto después de inicialización, autenticación, catálogo, detalle/carrito y perfil/navegación. |
| Pruebas unitarias | 51 pruebas aprobadas en 7 archivos con Vitest. |
| Análisis estático | `npm run lint` correcto. |
| Auditoría de dependencias | `npm audit`: 0 vulnerabilidades tras alinear Angular y fijar Capacitor 8.4.3. |
| API real | Login, perfil, catálogo completo y detalle responden correctamente; credenciales públicas verificadas. |
| Navegador | 15 grupos funcionales comprobados, incluidos navegación visible y badge. |
| Presentación | Cinco vistas a 390, 768 y 1440 px; sin desbordamiento horizontal. |
| Capturas de entrega | Login, productos, detalle, carrito y perfil obtenidos con API real, sin mocks. |
| Checkout limpio | Instalación, 51 pruebas, lint y build correctos; `git status --short` vacío al terminar. |
| GitHub | Publicación en `main` correcta y hash remoto comparado con el local. |

## Escenarios del navegador

- Redirección al login desde todas las rutas privadas y rutas desconocidas.
- Campos obligatorios, credenciales incorrectas, login real y persistencia tras recargar.
- Fallo de conexión durante el login sin crear una sesión ficticia.
- Navegación con clics en Productos, Carrito y Perfil, detalle desde una tarjeta y actualización del contador.
- Búsqueda por nombre, categoría y marca, incluyendo una búsqueda sin coincidencias.
- Detalle real, identificador inválido y respuesta 404 real.
- Agregado repetido, incremento/decremento, total, recarga, stock máximo, eliminación y vaciado confirmado.
- Compra simulada: el carrito permanece intacto hasta aceptar el resultado.
- Perfil real con proyección segura del usuario y logout que conserva el carrito.
- Fallo de red del catálogo: seis productos e imágenes locales; recuperación al reintentar.
- Respuestas 5xx: detalle de respaldo disponible y error comprensible cuando no existe copia local.
- Respuestas 4xx del catálogo sin activar el respaldo.
- Perfil con fallo de red recuperable y cierre de sesión ante un 401.
- Token vencido, usuario corrupto y carrito corrupto.
- Diseño responsive de las cinco vistas en tres tamaños de pantalla.

Los fallos controlados se inyectan únicamente en el script de pruebas. Las capturas de `docs/screenshots/` se generan por separado sin interceptar la API. El script de verificación guarda diagnósticos en `artifacts/browser/`, carpeta ignorada por Git; no escribe tokens a disco.

Se aprobaron 13 grupos en la primera ejecución. Se corrigieron dos selectores de la automatización (un enlace identificado como botón y una espera de cierre de Alert), y los escenarios afectados pasaron en una ejecución selectiva posterior. La corrección visual del título del catálogo se revisó nuevamente en los tres tamaños.

## Criterios de aceptación

| Criterio | Evidencia |
| --- | --- |
| CA-01 | `npm install` completo. |
| CA-02 | Axios instalado y declarado en `package.json`. |
| CA-03–04 | `AppModule`, módulos de páginas, `standalone: false` y arranque modular. |
| CA-05–06 | Login real y sesión conservada al recargar. |
| CA-07–08 | Catálogo real y detalle individual verificados. |
| CA-09–12 | Agregado, cantidades, eliminación y totales comprobados. |
| CA-13–14 | Perfil real y logout funcional. |
| CA-15–16 | Rutas protegidas y cinco vistas funcionales. |
| CA-17 | Interfaces Product, User, CartItem y AuthResponse. |
| CA-18 | Cinco PNG reales en `docs/screenshots/`. |
| CA-19–21 | README, evidencia de IA y ejemplos aceptados/modificados/descartados. |
| CA-22 | Compilación de producción correcta. |
| CA-23 | Historial con commits por etapas. |
| CA-24 | Origin: `https://github.com/Luvleydie/Fued9cuatri.git`. |
| CA-25 | `git push -u origin main` correcto; el hash remoto coincide con el local. |

## Reproducción y publicación final

Se creó un worktree separado y limpio del commit `a6b5138`, que contiene el código completo, documentación y capturas. Allí se ejecutó la siguiente secuencia:

```bash
npm install
npm test -- --watch=false
npm run lint
ionic build
git status --short
```

La instalación añadió 583 paquetes y no reportó vulnerabilidades. Las 51 pruebas pasaron, el lint no detectó problemas y la compilación de producción terminó correctamente, con un tamaño inicial aproximado de 657 KB. Git no reportó modificaciones de archivos rastreados después de la secuencia, incluido el lockfile.

Posteriormente se ejecutaron `git fetch origin` y `git push -u origin main`. GitHub creó la rama `main` y el hash consultado con `git ls-remote origin refs/heads/main` coincidió con el commit local. El último commit de documentación registra estos resultados; no modifica el código de la aplicación.

Repositorio de entrega: [Luvleydie/Fued9cuatri](https://github.com/Luvleydie/Fued9cuatri).
