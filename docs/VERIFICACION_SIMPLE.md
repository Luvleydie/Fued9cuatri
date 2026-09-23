# Verificación: NovaCart con XAMPP y MCP

Ejecutada el 22 de septiembre de 2026 (hora local). La app instalada se probó en http://localhost/novacart/.

| Comprobación | Resultado |
|---|---|
| Angular: npm test -- --watch=false | 33 pruebas aprobadas en 6 archivos |
| API PHP/MySQL: npm run test:api | 26 comprobaciones aprobadas tras separar los endpoints |
| Navegador: npm run test:e2e | 5 escenarios aprobados |
| npm run lint | Sin errores |
| npm run deploy:xampp | Compilación y copia a Apache correctas |
| npm run test:mcp | Conexión stdio y cuatro herramientas comprobadas |
| MCP desde Codex | describe_schema y list_products consultaron MySQL realmente |

## Lo que se comprobó

La separación en `server/endpoints/` se volvió a comprobar contra Apache. Se añadieron verificaciones de métodos HTTP de login/registro y del bloqueo de acceso directo a los archivos internos. Todos los archivos PHP pasaron la comprobación de sintaxis.

- Rutas protegidas, campos vacíos y credenciales incorrectas.
- Registro, username duplicado, login real y sesión en sessionStorage.
- CRUD de usuarios con consultas nuevas a MySQL y recarga de navegador.
- Error Axios 503 al guardar: el formulario conserva sus valores.
- Respuesta 401: se elimina la sesión y se vuelve al login.
- Contraseña vacía al editar conserva la actual; cambiarla revoca sesiones.
- Cantidades y stock validados; precio y propietario del carrito determinados en PHP.
- Carritos separados por cuenta, cierre/reapertura de pestaña, reautenticación y recuperación.
- Cambio de cuenta sin reutilizar el perfil anterior.
- Cuatro pantallas sin desbordamiento horizontal a 390, 768 y 1440 píxeles.
- Herramientas MCP de consulta sin contraseñas ni tokens en los resultados de datos.

Las pruebas crean usuarios temporales y eliminan únicamente sus propios registros. La base novacart del usuario se mantiene; no se ejecutaron DROP ni TRUNCATE. Se crearon cuatro tablas, una cuenta demo y tres productos iniciales.

## Evidencia

- [Capturas de las cuatro pantallas](screenshots-simple/).
- [Video: cierre real del navegador y persistencia en MySQL](videos/novacart-mysql.mp4).
- [Documento PDF](../output/pdf/NovaCart_Guia.pdf).
- [Explicación detallada y prompts](PROYECTO_SIMPLE.md).

El video reúne dos grabaciones reales: primero registro, CRUD y carrito; después una nueva instancia del navegador exige login y muestra los datos conservados. Incluye rótulos explicativos. No muestra el reinicio de MySQL.

Los resultados JSON detallados se generan localmente en artifacts/api/results.json y artifacts/browser/results.json. Esta carpeta está excluida de Git.

El MCP usa consultas fijas de lectura con la configuración local de PHP; no proporciona una herramienta de SQL arbitrario. La app es una práctica sin roles y no procesa pagos.
