# NovaCart: cliente móvil Android conectado a la API

La app utiliza el mismo contrato JSON de la web: Angular/Ionic → Axios → PHP → MySQL. El APK incluye las pantallas, imágenes y cumbia; las cuentas, sesiones y carritos siguen en el servidor. La compilación móvil utiliza una URL absoluta y una carpeta `www-mobile/` independiente de `www/`.

## Compilar y probar con XAMPP en el emulador

Activa Apache y MySQL en XAMPP. Desde la raíz del proyecto:

```powershell
npm run api:deploy
npm run mobile:apk -- --emulator
```

El comando compila Angular, sincroniza Capacitor y genera `output/android/NovaCart-debug.apk`. Usa `http://10.0.2.2/novacart/api`; `10.0.2.2` permite que el emulador llegue al equipo anfitrión. No utiliza `localhost` como dirección de la API del teléfono.

Con un emulador ya arrancado:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r output/android/NovaCart-debug.apk
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" shell am start -n com.novacart.app/.MainActivity
```

`mobile:build` prepara y sincroniza Android sin generar el APK. `mobile:apk` añade la compilación Gradle `assembleDebug`. Se necesita Android SDK y JDK 21; en Windows el script aprovecha el JDK de Android Studio. `NOVACART_JAVA_HOME` permite seleccionar otro JDK y `ANDROID_HOME` otro SDK, sin modificar las variables globales del equipo.

## Teléfono físico o servidor HTTPS

Para un servidor accesible por Internet o la red de la escuela:

```powershell
npm run mobile:apk -- --api-url https://servidor.example/novacart/api
```

Sustituye el ejemplo por la dirección real. Para pruebas locales con un teléfono en la misma red Wi-Fi que la PC:

```powershell
npm run mobile:apk -- --api-url http://192.168.1.50/novacart/api --allow-local-http
```

La IP es un ejemplo: usa la de tu PC y comprueba que Apache sea accesible en esa red. También se puede proporcionar `NOVACART_API_URL` como variable de entorno. No se aceptan contraseñas, parámetros ni tokens en la URL. HTTP requiere la opción explícita y una IPv4 privada. Las direcciones relativas y loopback se rechazan al compilar.

El permiso de tráfico HTTP y contenido mixto se limita a la variante **debug** de Android. La variante release mantiene HTTP deshabilitado y necesita una compilación con una API HTTPS. Este comando entrega un APK de pruebas, no un paquete firmado para publicar en Google Play.

## CORS y autenticación

`server/cors.php` se ejecuta antes de abrir MySQL o validar sesión. Atiende `OPTIONS` con 204, permite los métodos GET, POST, PUT y DELETE y las cabeceras Authorization y Content-Type. Solo acepta orígenes autorizados o el mismo origen del servidor; no habilita cookies entre orígenes.

Los orígenes móviles predeterminados son `https://localhost` (Android) y `capacitor://localhost` (iOS). También se aceptan `http://localhost:8100` y `http://localhost:4200` para el proxy de desarrollo Angular. La aplicación conserva el token Bearer temporal por sesión. Un origen distinto recibe 403 antes de cualquier escritura. Para un dominio adicional, configura la lista completa `cors_allowed_origins` en `server/config.local.php`, o la variable `CORS_ALLOWED_ORIGINS` con valores separados por comas. Un proxy HTTPS externo debe incluir su origen público en esa lista.

La app nativa no registra el service worker de la web: sus recursos vienen dentro del APK. La caché de consultas por sesión y los avisos de desconexión continúan funcionando.

## Comprobaciones

```powershell
npm run test:mobile-config
npm run test:cors
npm test -- --watch=false
npm run lint
npm run mobile:apk -- --emulator
```

La prueba CORS usa un servidor PHP temporal y una base simulada; comprueba que los preflight y los rechazos no consulten la base. La prueba de configuración evita empaquetar una API relativa, loopback o HTTP público.

Referencias: [red del emulador Android](https://developer.android.com/studio/run/emulator-networking-address) y [configuración de Capacitor](https://capacitorjs.com/docs/config). El código instalado de Capacitor también se revisó para comprobar el origen de la WebView y las opciones de red.
