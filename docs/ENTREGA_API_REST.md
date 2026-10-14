# Conexión de NovaCart con una API REST

Entrega del 14 de octubre de 2026. La aplicación Ionic con Angular usa servicios inyectables y Axios para consumir la API PHP de XAMPP. Los datos se guardan en MySQL.

**[Descargar el documento Word con evidencias](../output/NovaCart_Entrega_API_REST.docx).**

## Código subido a Git

- Repositorio: [Luvleydie/Fued9cuatri](https://github.com/Luvleydie/Fued9cuatri).
- Rama de entrega: [entrega/api-rest-2026-10-14](https://github.com/Luvleydie/Fued9cuatri/tree/entrega/api-rest-2026-10-14).
- Commit de implementación y capturas: [b2fe4303741475cfca33f531cef09ca881d81790](https://github.com/Luvleydie/Fued9cuatri/commit/b2fe4303741475cfca33f531cef09ca881d81790).

El DOCX se incorpora en un commit posterior de la misma rama. La rama reúne el código actual necesario para reproducir las capturas; la rama local `main` conserva sus cambios previos.

## Requisitos implementados

| Requisito | Código | Resultado |
|---|---|---|
| GET | `UsersService.getUsers()` | `GET /users` devuelve 200 y la lista de usuarios |
| POST | `UsersService.createUser(input)` | `POST /users` devuelve 201 con el usuario creado |
| PUT o PATCH | `UsersService.updateUser(id, input)` | Se implementa **PUT**; devuelve 200 y el usuario actualizado |
| DELETE | `UsersService.deleteUser(id)` | `DELETE /users/{id}` devuelve 204 sin cuerpo |
| Servicios Angular | `src/app/services/users.service.ts` y `cart.service.ts` | `@Injectable({ providedIn: 'root' })`, promesas e interfaces tipadas |
| Respuestas y errores | `core/api/api-errors.ts`, `data-projections.ts` y páginas | Validación de respuestas, mensajes comprensibles y conservación del formulario |
| Loading | `home.page.html` y `cart.page.html` | `ion-spinner`, estados accesibles y bloqueo de controles durante las solicitudes |

El cliente compartido en `src/app/core/api/axios-client.ts` configura la URL de API, JSON, token Bearer y un timeout de 15 segundos. Las páginas llaman a los servicios con `try/catch/finally`: `finally` libera los estados `isLoading` e `isSubmitting` en éxito y error.

La API está en `server/index.php` y `server/endpoints/users.php`. La interfaz actualiza sus datos cuando la API confirma. Ante un resultado incierto de escritura exige consultar antes de repetir, para evitar duplicados. Un 401 limpia la sesión y regresa al acceso.

## Capturas del funcionamiento

Las imágenes proceden del navegador ejecutando la aplicación. Se muestran exclusivamente la cuenta demo y registros temporales de la prueba.

| Captura | Evidencia |
|---|---|
| [Vista general](screenshots-rest/00-vista-general.png) | Aplicación Ionic con la cuenta de demostración |
| [Loading GET](screenshots-rest/01-loading-get.png) | Solicitud pendiente y controles deshabilitados |
| [GET](screenshots-rest/02-get-usuarios.png) | Usuarios recibidos de la API |
| [Loading POST](screenshots-rest/03-loading-post.png) | Indicador de procesamiento de una escritura |
| [POST](screenshots-rest/04-post-creado.png) | Nuevo usuario temporal en el directorio |
| [PUT](screenshots-rest/05-put-actualizado.png) | Nombre actualizado y persistencia verificada tras recarga |
| [DELETE](screenshots-rest/06-delete-eliminado.png) | Usuario eliminado y ausencia verificada tras recarga |
| [Error 503](screenshots-rest/07-error-controlado.png) | Mensaje ante un fallo simulado |
| [Recuperación](screenshots-rest/08-recuperacion.png) | Formulario conservado después de recuperar la consulta |
| [Error 409](screenshots-rest/09-error-409-real.png) | Respuesta real al intentar duplicar el usuario |

GET, POST, PUT y DELETE se ejecutan contra PHP y MySQL reales. Para mostrar el loading, Playwright retiene momentáneamente GET y POST antes de enviarlos. El error 503 se simula únicamente en el navegador y no llega a MySQL. El error 409 proviene de la API real. La ejecución verifica que no quedan usuarios temporales y no registra tokens, contraseñas, cuerpos ni encabezados HTTP.

## Comprobaciones ejecutadas

- `npm test -- --watch=false`: 322 pruebas aprobadas en 22 archivos.
- `npm run test:api`: 35 comprobaciones aprobadas.
- `npm run lint`: sin errores.
- `npm run deploy:xampp`: compilación y despliegue local correctos.
- `npm run test:rest-delivery`: 12 comprobaciones aprobadas, 10 capturas y cero registros temporales restantes.

Resultados: [verificación de interfaz](evidencia/rest-verificacion.json) y [comprobaciones de calidad](evidencia/rest-calidad.json).

## Reproducir la entrega

Activa Apache y MySQL en XAMPP. La base `novacart` debe existir antes de ejecutar el instalador. Consulta los requisitos de Node y XAMPP en el [README](../README.md).

```powershell
git clone --branch entrega/api-rest-2026-10-14 https://github.com/Luvleydie/Fued9cuatri.git
cd Fued9cuatri
npm ci
npm run db:setup
npm run deploy:xampp
npm run test:rest-delivery
```

Abre `http://localhost/novacart/` con la cuenta demo documentada en README. En Usuarios puedes actualizar, crear, editar y eliminar. La prueba automatizada [verify-rest-delivery.mjs](../scripts/verify-rest-delivery.mjs) repite el recorrido y limpia sus propios registros.

Esta entrega verifica la versión web. No incluye una prueba en hardware Android ni Bluetooth.
