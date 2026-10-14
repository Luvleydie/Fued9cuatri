# Enviar metadata por Bluetooth Low Energy

La pantalla **Inicio / Datos de usuario** (`/home`) permite elegir un archivo, revisar su metadata y enviarla a un destino Bluetooth Low Energy (BLE). Hay dos destinos: otro teléfono Android con NovaCart en modo receptor, o un periférico BLE con un servicio y una característica de escritura compatibles.

La transmisión contiene únicamente nombre, tamaño en bytes, tipo MIME y fecha de última modificación del archivo. No incluye el contenido, la ruta local ni los datos de la cuenta. Elegir el archivo no lo envía: el envío comienza al pulsar el botón correspondiente después de seleccionar el destino.

## Enviar a otro teléfono con NovaCart

1. Instala la versión actual del APK en ambos teléfonos y abre **Inicio**. Activa Bluetooth.
2. En el teléfono destino, activa **Recibir metadata** y concede el permiso de dispositivos cercanos si Android lo solicita. Mantén esa pantalla abierta y la aplicación en primer plano.
3. En el teléfono emisor, selecciona un archivo y revisa los cuatro datos de la vista previa.
4. En **Tipo de destino**, elige **Otro teléfono con NovaCart**. Pulsa **Preparar Bluetooth** y luego **Elegir dispositivo cercano**. Selecciona el teléfono receptor en la lista; su nombre aparece en el destino como **Visible como**.
5. Pulsa **Enviar metadata**. Comprueba el resultado del envío y que los mismos datos aparezcan en el panel de recepción del otro teléfono.
6. Pulsa **Detener recepción** al terminar. Para volver a recibir, pulsa **Recibir metadata** de nuevo. La recepción también se detiene al salir de esta pantalla o dejar NovaCart en segundo plano.

La recepción usa un servidor GATT y anuncios BLE nativos de Android. El teléfono destino necesita hardware compatible con el rol periférico y anuncios BLE; si no los admite, la app informa del problema. Un teléfono con Bluetooth encendido pero sin el modo receptor activo no constituye un destino NovaCart.

## Enviar a un periférico BLE existente

1. Obtén del fabricante o del firmware los UUID del servicio y de su característica de escritura.
2. Confirma que la característica admita **escritura con respuesta** (`write`) y que el dispositivo acepte el formato JSON terminado en salto de línea descrito abajo. Si usa otro protocolo, adapta el firmware o el transporte antes de enviarlo.
3. Selecciona un archivo, elige **Otro receptor BLE** e introduce ambos UUID completos, de 36 caracteres.
4. Pulsa **Preparar Bluetooth** y luego **Elegir dispositivo cercano**; elige el periférico que anuncia ese servicio. Si ya preparaste Bluetooth, abre directamente el selector. **Cambiar destino** permite seleccionar otro dispositivo.
5. Envía la metadata y comprueba en el propio dispositivo que reconstruyó y procesó el mensaje.

Un UUID identifica dónde escribir; no convierte un protocolo propietario en receptor de metadata. El resultado del envío a un periférico indica que las escrituras GATT fueron aceptadas, sin confirmar qué hizo su firmware con el JSON. Auriculares, Bluetooth clásico/serial y la función de compartir archivos del sistema no ofrecen este protocolo automáticamente. El [plugin utilizado](https://github.com/capacitor-community/bluetooth-le#introduction) implementa BLE en rol central; el receptor Android de NovaCart es una integración nativa adicional.

## Mensaje común

El emisor codifica un objeto JSON en UTF-8, con un máximo de **16 384 bytes** antes del salto de línea del modo externo:

```json
{
  "version": 1,
  "type": "file-metadata",
  "file": {
    "name": "reporte.pdf",
    "size": 2048,
    "type": "application/pdf",
    "lastModified": 1791763200000
  }
}
```

`size` es el tamaño del archivo, no el del mensaje BLE. `lastModified` es una fecha en milisegundos desde Unix epoch. `type` dentro de `file` puede ser una cadena vacía cuando el selector no conoce el tipo MIME. No hay campos con identificadores de usuario, credenciales, rutas ni contenido del archivo.

### Transporte NovaCart

| Elemento | Valor |
|---|---|
| UUID del servicio | `7d2ea28a-f7bd-485a-bd9d-92ad6ecfe93e` |
| UUID de la característica | `7d2ea28b-f7bd-485a-bd9d-92ad6ecfe93e` |
| Operación GATT | Escritura con respuesta |
| Tamaño máximo por escritura | 20 bytes |

El emisor espera la respuesta de cada escritura antes de continuar:

| Trama | Bytes | Significado |
|---|---|---|
| Inicio | `01` + longitud de 4 bytes | Longitud total del JSON UTF-8 como entero de 32 bits sin signo en orden little-endian |
| Datos | `02` + 1 a 19 bytes | Siguiente fragmento de los bytes del JSON |
| Fin | `03` | Validar la longitud, decodificar UTF-8 y procesar el objeto completo |

Por ejemplo, para un JSON de 256 bytes, el inicio es `01 00 01 00 00`. El receptor debe acumular los bytes después de `02` sin incluir el byte de control. Un carácter acentuado o emoji puede quedar dividido entre dos fragmentos: se decodifica UTF-8 **después de reunir todos los bytes**. No se agrega salto de línea en este modo.

Un receptor que implemente este protocolo debe rechazar longitudes mayores al límite, fragmentos sin inicio, desbordamientos, un fin antes de recibir la longitud completa, UTF-8 o JSON inválidos y un sobre con versión o tipo incorrectos. Debe descartar una transferencia incompleta al desconectarse. Un inicio repetido durante una transferencia se rechaza y descarta el mensaje parcial de esa conexión; entonces puede iniciarse otro envío. El éxito de la trama final en NovaCart corresponde a la validación del mensaje recibido.

### Transporte para otro BLE: JSON y salto de línea

En el modo **Otro receptor BLE**, la app escribe el mismo JSON compacto seguido por un único byte `0A` (`\n`). Divide la secuencia en escrituras de hasta 20 bytes y espera la respuesta de cada una. No utiliza los bytes de control `01`, `02` y `03` del transporte NovaCart.

El firmware debe anunciar el UUID del servicio elegido, publicar la característica con `write` y conservar un buffer por conexión. Este pseudocódigo describe la integración de su callback de escritura; no es una biblioteca ni un programa completo para una placa:

```text
al conectar:
    buffer = bytes vacíos

al escribir(fragmento):
    para cada byte en fragmento:
        si byte == 0x0A:
            texto = decodificar UTF-8 estricto(buffer)
            mensaje = analizar JSON(texto)
            validar version == 1 y type == "file-metadata"
            validar file.name, file.size, file.type y file.lastModified
            procesar metadata
            buffer = bytes vacíos
        en otro caso:
            si tamaño(buffer) >= 16384:
                descartar buffer y rechazar mensaje
            agregar byte a buffer
    responder a la escritura GATT

al desconectar:
    descartar buffer
```

El JSON compacto escapa los saltos de línea dentro de las cadenas; el byte `0A` separa mensajes completos. No analices cada fragmento como si fuera un JSON independiente. Si falla un envío parcial, desconecta y limpia el buffer antes de reintentarlo.

## Preparación y compilación

La dependencia `@capacitor-community/bluetooth-le` está declarada en `package.json` y fijada por `package-lock.json`. Para una copia nueva:

```powershell
npm ci
npm run mobile:apk -- --api-url https://servidor.example/novacart/api
```

Sustituye la URL por la API real. `mobile:apk` compila los recursos, ejecuta la sincronización de Capacitor con Android y genera `output/android/NovaCart-debug.apk`; `mobile:build` hace lo mismo sin generar el APK. Para XAMPP y un teléfono en la misma red, consulta las opciones de IP privada y HTTP local de [Cliente móvil](CLIENTE_MOVIL.md). La opción `--emulator` sirve para la API del emulador, pero la comprobación BLE de esta funcionalidad requiere dispositivos físicos compatibles.

En navegador, el envío necesita Web Bluetooth y un contexto seguro, como HTTPS o localhost, según la [especificación de Web Bluetooth](https://webbluetoothcg.github.io/web-bluetooth/). El selector debe abrirse desde la acción del usuario. El modo receptor está disponible en el APK Android, no en la web. Este proyecto no incluye una implementación receptora para iOS.

Android solicita los permisos que corresponden a su versión. En Android 12 o posterior se utilizan permisos de dispositivos cercanos; en versiones anteriores la búsqueda BLE puede requerir ubicación y que su servicio esté activo. La declaración `neverForLocation` evita utilizar el escaneo para derivar ubicación en Android moderno. Véase [Permisos Bluetooth de Android](https://developer.android.com/develop/connectivity/bluetooth/bt-permissions).

## Código de la funcionalidad

- [Componente y ciclo de vida](../src/app/core/file-metadata-transfer.component.ts) e [interfaz](../src/app/core/file-metadata-transfer.component.html): selección de archivo, vista previa, destino, envío, progreso y recepción.
- [Metadata del archivo](../src/app/core/file-metadata.ts): selección de los cuatro campos, validación y serialización del mensaje.
- [Servicio emisor BLE](../src/app/services/ble-metadata.service.ts): inicialización, selector, conexión, fragmentación, escrituras, cancelación y desconexión.
- [Interfaz Capacitor del receptor](../src/app/services/metadata-receiver.ts) y [plugin Android](../android/app/src/main/java/com/novacart/app/MetadataReceiverPlugin.java): anuncios BLE, servidor GATT, permisos y entrega de metadata a la pantalla.
- [Ensamblador de tramas](../android/app/src/main/java/com/novacart/app/MetadataFrameAssembler.java): reconstrucción del mensaje NovaCart y control de transferencias parciales.

## Comprobación con dispositivos físicos

Las pruebas de lógica se ejecutan con `npm test -- --watch=false`. Después de `npm run build`, `npm run test:bluetooth` verifica la interfaz y el adaptador web real del plugin con hardware simulado, ambos formatos y las vistas de 360, 390 y 1440 px. Las pruebas del ensamblador Android se ejecutan con `./gradlew :app:testDebugUnitTest` desde `android` (JDK 21).

La compilación y las pruebas automatizadas no acreditan una transmisión por radio. Queda por ejecutar esta verificación en dos teléfonos reales y en el periférico concreto que se vaya a usar:

- Enviar un archivo cuyo nombre contenga acentos y emoji; comparar nombre, tamaño, tipo y fecha entre origen y destino.
- Enviar un archivo vacío y otro cuyo tipo MIME no esté identificado.
- Repetir un envío y seleccionar después otro archivo para comprobar que se transmite la metadata actual.
- Cancelar el selector, denegar permisos y apagar Bluetooth; comprobar que la app explica el estado y permite reintentar.
- Alejar o desconectar el receptor durante una transmisión; comprobar el error y que un nuevo envío completo no mezcle fragmentos del anterior.
- Detener y volver a activar la recepción; comprobar que el receptor reaparece en el selector y vuelve a recibir.
- En un periférico externo, validar la selección por UUID, la escritura con respuesta y la reconstrucción del JSON hasta `0A`; comprobar también el fallo con una característica incompatible.
