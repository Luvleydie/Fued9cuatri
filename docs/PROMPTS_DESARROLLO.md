> Documento de la version anterior. La entrega vigente usa cuatro pantallas y PHP/MySQL: [guia actual](PROYECTO_SIMPLE.md).

# NovaCart: desarrollo explicado mediante prompts

Este documento presenta **prompts reconstruidos con fines académicos**. El proyecto se solicitó mediante una instrucción general y se trabajó por etapas; los textos siguientes representan esas tareas y no son transcripciones de conversaciones separadas.

## 1. Crear la base del proyecto

**Prompt:** «Crea NovaCart con Ionic, Angular y TypeScript. Utiliza NgModules, organiza las páginas en módulos y prepara Git para registrar el desarrollo».

**Qué se intentaba lograr:** disponer de una estructura clara, compatible con las herramientas instaladas y fácil de explicar en clase.

**Resultado final:** una aplicación en la raíz del repositorio con `AppModule`, `AppRoutingModule`, cinco módulos de páginas y un historial de commits por etapas.

## 2. Implementar el inicio de sesión

**Prompt:** «Instala Axios y conecta el login con DummyJSON. Guarda el token, recupera la sesión al recargar y protege las páginas privadas».

**Qué se intentaba lograr:** demostrar consumo real de una API REST y comprender el uso de un token Bearer.

**Resultado final:** login con validaciones y mensajes amigables, instancia central de Axios, interceptor, persistencia del access token y guards. Se guardan únicamente los datos básicos del usuario, sin contraseñas.

## 3. Construir el catálogo

**Prompt:** «Crea los modelos de datos y un catálogo de productos con tarjetas Ionic. Agrega búsqueda por nombre, categoría o marca y un respaldo local para fallos de conexión».

**Qué se intentaba lograr:** separar los datos de la presentación y permitir explorar productos en distintos tamaños de pantalla.

**Resultado final:** catálogo responsive obtenido con Axios, búsqueda sobre la colección completa y seis productos locales con sus imágenes, utilizados sólo cuando falla la API.

## 4. Agregar detalle y carrito

**Prompt:** «Muestra la información de cada producto e implementa un carrito que permita agregar, eliminar y cambiar cantidades. Guarda los cambios y calcula el total sin errores de decimales».

**Qué se intentaba lograr:** completar el recorrido de selección de productos sin desarrollar un servidor o sistema de pagos.

**Resultado final:** detalle con manejo de productos inexistentes y carrito persistente con límites de stock, subtotales y total en USD. La finalización muestra una compra simulada y limpia el carrito al aceptarla.

## 5. Completar perfil y navegación

**Prompt:** «Consulta el perfil del usuario autenticado, agrega cierre de sesión y crea una navegación inferior entre Productos, Carrito y Perfil. Unifica el diseño en tonos morados».

**Qué se intentaba lograr:** ofrecer una aplicación fácil de recorrer, con información de cuenta y una apariencia consistente.

**Resultado final:** perfil conectado a `/auth/me`, cierre de sesión, navegación inferior y contador de artículos que se actualiza al modificar el carrito.

## 6. Comprobar y documentar

**Prompt:** «Revisa los errores, prueba los recorridos principales, captura las cinco pantallas reales y escribe la documentación académica. Comprueba la compilación antes de entregar el proyecto en GitHub».

**Qué se intentaba lograr:** entregar una aplicación reproducible y evidencia revisable de su funcionamiento.

**Resultado final:** pruebas unitarias y scripts de navegador, README, modelo de datos, registro del uso de IA y capturas de ejecución. Los resultados medidos de las comprobaciones se registran en [VERIFICACION.md](VERIFICACION.md).

## Resultado general

NovaCart integra cinco vistas: Login, Productos, Detalle, Carrito y Perfil. El proyecto demuestra Ionic, Angular con NgModules, Axios, API REST, almacenamiento local y Git. La compra es una simulación académica y no procesa pagos reales.

La evaluación concreta del código aceptado, modificado y descartado está en [EVIDENCIA_IA.md](EVIDENCIA_IA.md).
