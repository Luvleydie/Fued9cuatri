# Uso de IA para generar y revisar el modelo

**Actualización: 21 de septiembre de 2026.** La IA se utilizó para revisar el modelo de NovaCart y preparar la entrega de entidades, interfaces TypeScript, servicios Angular/Ionic, CRUD y diagramas.

## Solicitud y punto de partida

Al iniciar esta revisión, el directorio de trabajo ya contenía la API TypeScript con SQLite, los tres servicios, las interfaces y la pantalla Inventario con CRUD. La documentación anterior registraba la sustitución de DummyJSON por un servidor propio. Se partió de esa implementación para completar y verificar los entregables solicitados; la ampliación previa no se atribuye a esta sesión.

## Cómo se utilizó la IA

La IA contrastó SQL, interfaces, servicios y pantallas. Se completó la documentación de acceso a datos y se añadió un diagrama de clases e interfaces basado en el código.

| Etapa | Aporte de la IA | Resultado revisable |
| --- | --- | --- |
| Revisar entidades | Contrastar usuarios, sesiones y productos con claves y restricciones reales. | [Esquema SQL](../server/schema.sql) y [modelo con diagramas](MODELO_DATOS.md). |
| Revisar contratos | Comprobar campos, opcionalidad y diferencias entre entrada, salida y estado de pantalla. | [Inventario de interfaces](INTERFACES_TYPESCRIPT.md). |
| Revisar acceso a datos | Identificar inyección de servicios, métodos CRUD, transporte HTTP, persistencia local y manejo de errores. | [Servicios Angular](SERVICIOS_DATOS.md) y [API](API.md). |
| Comprobar la entrega | Relacionar documentación, código y pruebas disponibles sin inventar resultados de ejecución. | [Registro de verificación](VERIFICACION.md). |

## Decisiones del modelo revisadas con IA

1. **Conservar contratos compartidos.** `User`, `Product` y `CartItem` mantienen el significado de los datos que usan las pantallas.
2. **Separar entrada y salida.** `ProductInput` contiene campos editables; `Product` añade el identificador asignado por SQLite. `LoginRequest` amplía las credenciales con la duración opcional de sesión.
3. **Relacionar las entidades reales.** `sessions.user_id` identifica al usuario de una sesión y `products.created_by` al creador del producto. `CartItem` permanece en el navegador.
4. **Proteger datos privados.** `User` excluye contraseñas, hash y sal. El login devuelve `accessToken`; no se declara renovación con `refreshToken`.
5. **Validar durante la ejecución.** Las interfaces desaparecen al compilar. La API valida entradas, SQLite aplica restricciones y el navegador comprueba los datos restaurados.
6. **Separar estado visual y entidad.** `PagePhase` representa una operación de pantalla; no es una tabla ni una columna.

## Alcance reflejado en el código

Se conservan los módulos Angular y el carrito local. El CRUD persistente se aplica a productos mediante la API propia. Quedan fuera el registro público, los roles, los pedidos, los pagos y la renovación de tokens. La compra simulada no reduce stock en SQLite. Los diagramas representan las tablas, interfaces y servicios existentes.

## Evidencia y límites del registro

La IA puede omitir restricciones o proponer entidades ajenas a la aplicación. Para reducir errores se tomó el código como referencia. No se atribuyen aprobaciones a personas ni se reconstruyen prompts como citas literales. Los resultados realmente ejecutados se registran en [VERIFICACION.md](VERIFICACION.md).

[EVIDENCIA_IA.md](EVIDENCIA_IA.md) y [PROMPTS_DESARROLLO.md](PROMPTS_DESARROLLO.md) conservan la etapa del **11 de septiembre de 2026** con DummyJSON; sus referencias a cinco pantallas, `refreshToken` y ausencia de servidor son históricas. El README y los documentos enlazados aquí describen la versión actual.
