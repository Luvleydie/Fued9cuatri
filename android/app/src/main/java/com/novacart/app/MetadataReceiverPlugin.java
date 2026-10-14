package com.novacart.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattServer;
import android.bluetooth.BluetoothGattServerCallback;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.AdvertiseCallback;
import android.bluetooth.le.AdvertiseData;
import android.bluetooth.le.AdvertiseSettings;
import android.bluetooth.le.BluetoothLeAdvertiser;
import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;
import android.os.SystemClock;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.json.JSONObject;
import org.json.JSONTokener;

@CapacitorPlugin(
    name = "MetadataReceiver",
    permissions = {
        @Permission(alias = "connect", strings = {Manifest.permission.BLUETOOTH_CONNECT}),
        @Permission(alias = "advertise", strings = {Manifest.permission.BLUETOOTH_ADVERTISE})
    }
)
@SuppressLint("MissingPermission") // Checked before startup; revocation also stops the session.
public class MetadataReceiverPlugin extends Plugin {
    private static final UUID SERVICE = UUID.fromString("7d2ea28a-f7bd-485a-bd9d-92ad6ecfe93e");
    private static final UUID CHARACTERISTIC = UUID.fromString("7d2ea28b-f7bd-485a-bd9d-92ad6ecfe93e");
    private final Handler main = new Handler(Looper.getMainLooper());
    private final MetadataFrameAssembler frames = new MetadataFrameAssembler();
    // All state and Bluetooth callbacks are serialized onto the main thread.
    private PluginCall pendingStart;
    private BluetoothAdapter adapter;
    private BluetoothGattServer server;
    private BluetoothLeAdvertiser advertiser;
    private AdvertiseCallback advertisingCallback;
    private boolean active;
    private boolean foreground = true;
    private boolean destroyed;
    private int generation;
    private String receiverName;
    private Runnable startupTimeout;
    private Runnable monitor;

    @PluginMethod
    public void start(PluginCall call) {
        main.post(() -> {
            if (!foreground || destroyed) {
                call.reject("Abre NovaCart para recibir metadata por Bluetooth.");
                return;
            }
            if (active) {
                call.resolve(new JSObject().put("name", receiverName));
                return;
            }
            if (pendingStart != null) {
                call.reject("La recepción Bluetooth ya se está iniciando.");
                return;
            }
            pendingStart = call;
            generation++;
            try {
                if (!hasReceiverPermissions()) {
                    requestPermissionForAliases(new String[]{"connect", "advertise"}, call, "receiverPermissions");
                } else {
                    openReceiver();
                }
            } catch (RuntimeException error) {
                stopSession("No se pudieron solicitar los permisos de Bluetooth. Vuelve a intentarlo.");
            }
        });
    }

    private boolean hasReceiverPermissions() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S
            || (getPermissionState("connect") == PermissionState.GRANTED
                && getPermissionState("advertise") == PermissionState.GRANTED);
    }

    @PermissionCallback
    private void receiverPermissions(PluginCall call) {
        main.post(() -> {
            if (pendingStart != call || destroyed || !foreground) return;
            if (!hasReceiverPermissions()) {
                stopSession("Permite los dispositivos cercanos para recibir metadata.");
                return;
            }
            openReceiver();
        });
    }

    private void openReceiver() {
        final int session = generation;
        try {
            BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
            adapter = manager == null ? null : manager.getAdapter();
            if (adapter == null || !adapter.isEnabled()) {
                stopSession("Activa Bluetooth en el teléfono para recibir metadata.");
                return;
            }
            advertiser = adapter.getBluetoothLeAdvertiser();
            if (!adapter.isMultipleAdvertisementSupported() || advertiser == null) {
                stopSession("Este teléfono no admite recibir mediante publicidad Bluetooth LE.");
                return;
            }
            receiverName = adapter.getName();
            if (receiverName == null || receiverName.trim().isEmpty()) receiverName = "Dispositivo Bluetooth";
            server = manager.openGattServer(getContext(), callbacks(session));
            if (server == null) {
                stopSession("No se pudo abrir el receptor Bluetooth.");
                return;
            }
            BluetoothGattService service = new BluetoothGattService(SERVICE, BluetoothGattService.SERVICE_TYPE_PRIMARY);
            service.addCharacteristic(new BluetoothGattCharacteristic(
                CHARACTERISTIC, BluetoothGattCharacteristic.PROPERTY_WRITE,
                BluetoothGattCharacteristic.PERMISSION_WRITE));
            startupTimeout = () -> {
                if (session == generation && pendingStart != null) {
                    stopSession("Bluetooth tardó demasiado en iniciar la recepción. Vuelve a intentarlo.");
                }
            };
            main.postDelayed(startupTimeout, 15_000);
            if (!server.addService(service)) stopSession("No se pudo registrar el servicio de metadata.");
        } catch (SecurityException error) {
            stopSession("Faltan permisos de Bluetooth. Permite los dispositivos cercanos.");
        } catch (RuntimeException error) {
            stopSession("No se pudo iniciar la recepción Bluetooth. Vuelve a intentarlo.");
        }
    }

    private BluetoothGattServerCallback callbacks(final int session) {
        return new BluetoothGattServerCallback() {
            @Override
            public void onServiceAdded(int status, BluetoothGattService service) {
                main.post(() -> {
                    if (session != generation || pendingStart == null) return;
                    if (status != BluetoothGatt.GATT_SUCCESS || !SERVICE.equals(service.getUuid())) {
                        stopSession("No se pudo registrar el servicio de metadata.");
                    } else {
                        advertise(session);
                    }
                });
            }

            @Override
            public void onConnectionStateChange(BluetoothDevice device, int status, int newState) {
                main.post(() -> {
                    if (session == generation && newState == BluetoothProfile.STATE_DISCONNECTED) {
                        frames.disconnect(device.getAddress());
                    }
                });
            }

            @Override
            public void onCharacteristicWriteRequest(BluetoothDevice device, int requestId,
                BluetoothGattCharacteristic characteristic, boolean preparedWrite,
                boolean responseNeeded, int offset, byte[] value) {
                byte[] frame = value == null ? null : value.clone();
                main.post(() -> receive(session, device, requestId, characteristic,
                    preparedWrite, responseNeeded, offset, frame));
            }

            @Override
            public void onCharacteristicReadRequest(BluetoothDevice device, int requestId,
                int offset, BluetoothGattCharacteristic characteristic) {
                main.post(() -> respond(session, device, requestId, BluetoothGatt.GATT_READ_NOT_PERMITTED));
            }

            @Override
            public void onDescriptorReadRequest(BluetoothDevice device, int requestId,
                int offset, BluetoothGattDescriptor descriptor) {
                main.post(() -> respond(session, device, requestId, BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED));
            }

            @Override
            public void onDescriptorWriteRequest(BluetoothDevice device, int requestId,
                BluetoothGattDescriptor descriptor, boolean preparedWrite, boolean responseNeeded,
                int offset, byte[] value) {
                if (responseNeeded) {
                    main.post(() -> respond(session, device, requestId, BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED));
                }
            }

            @Override
            public void onExecuteWrite(BluetoothDevice device, int requestId, boolean execute) {
                main.post(() -> {
                    if (session == generation) frames.disconnect(device.getAddress());
                    respond(session, device, requestId, BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED);
                });
            }
        };
    }

    private void advertise(final int session) {
        final BluetoothLeAdvertiser sessionAdvertiser = advertiser;
        advertisingCallback = new AdvertiseCallback() {
            @Override
            public void onStartSuccess(AdvertiseSettings settingsInEffect) {
                final AdvertiseCallback callback = this;
                main.post(() -> {
                    if (session != generation || pendingStart == null) {
                        try { sessionAdvertiser.stopAdvertising(callback); } catch (RuntimeException ignored) { }
                        return;
                    }
                    active = true;
                    if (startupTimeout != null) main.removeCallbacks(startupTimeout);
                    startupTimeout = null;
                    PluginCall call = pendingStart;
                    pendingStart = null;
                    call.resolve(new JSObject().put("name", receiverName));
                    monitor = new Runnable() {
                        @Override
                        public void run() {
                            if (session != generation || !active) return;
                            try {
                                if (!hasReceiverPermissions() || !adapter.isEnabled()) {
                                    stopSession("La recepción se detuvo porque Bluetooth no está disponible.");
                                    return;
                                }
                                frames.expire(SystemClock.elapsedRealtime());
                                main.postDelayed(this, 2_000);
                            } catch (RuntimeException error) {
                                stopSession("La recepción Bluetooth se detuvo. Vuelve a activarla.");
                            }
                        }
                    };
                    main.postDelayed(monitor, 2_000);
                });
            }

            @Override
            public void onStartFailure(int errorCode) {
                main.post(() -> {
                    if (session != generation) return;
                    if (errorCode == ADVERTISE_FAILED_DATA_TOO_LARGE) {
                        stopSession("El nombre Bluetooth del teléfono es demasiado largo. Acórtalo en Ajustes.");
                    } else if (errorCode == ADVERTISE_FAILED_FEATURE_UNSUPPORTED) {
                        stopSession("Este teléfono no admite recibir mediante publicidad Bluetooth LE.");
                    } else {
                        stopSession("No se pudo anunciar el receptor Bluetooth. Vuelve a intentarlo.");
                    }
                });
            }
        };
        try {
            AdvertiseSettings settings = new AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                .setConnectable(true).setTimeout(0)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM).build();
            AdvertiseData data = new AdvertiseData.Builder().addServiceUuid(new ParcelUuid(SERVICE)).build();
            AdvertiseData scanResponse = new AdvertiseData.Builder().setIncludeDeviceName(true).build();
            sessionAdvertiser.startAdvertising(settings, data, scanResponse, advertisingCallback);
        } catch (RuntimeException error) {
            stopSession("No se pudo anunciar el receptor Bluetooth. Revisa Bluetooth y sus permisos.");
        }
    }

    private void receive(int session, BluetoothDevice device, int requestId,
        BluetoothGattCharacteristic characteristic, boolean preparedWrite,
        boolean responseNeeded, int offset, byte[] frame) {
        if (session != generation || server == null) return;
        String deviceId = device.getAddress();
        if (!active || !responseNeeded || preparedWrite || offset != 0
            || !CHARACTERISTIC.equals(characteristic.getUuid())) {
            frames.disconnect(deviceId);
            if (responseNeeded) respond(session, device, requestId, BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED);
            return;
        }
        try {
            byte[] complete = frames.accept(deviceId, frame, SystemClock.elapsedRealtime());
            JSObject file = complete == null ? null : parseMetadata(complete);
            // The commit ACK succeeds only after the complete metadata has been validated.
            if (respond(session, device, requestId, BluetoothGatt.GATT_SUCCESS) && file != null) {
                notifyListeners("metadataReceived", new JSObject().put("file", file).put("deviceId", deviceId));
            }
        } catch (Exception error) {
            frames.disconnect(deviceId);
            respond(session, device, requestId, BluetoothGatt.GATT_FAILURE);
        }
    }

    private JSObject parseMetadata(byte[] bytes) throws Exception {
        String json = StandardCharsets.UTF_8.newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
            .decode(ByteBuffer.wrap(bytes)).toString();
        JSONTokener tokener = new JSONTokener(json);
        Object parsed = tokener.nextValue();
        if (!(parsed instanceof JSONObject) || tokener.nextClean() != 0) {
            throw new IllegalArgumentException("JSON inválido");
        }
        JSONObject envelope = (JSONObject) parsed;
        Object version = envelope.opt("version");
        if (envelope.length() != 3 || !(version instanceof Number)
            || ((Number) version).doubleValue() != 1 || !"file-metadata".equals(envelope.opt("type"))) {
            throw new IllegalArgumentException("Formato de metadata incompatible");
        }
        JSONObject file = envelope.optJSONObject("file");
        if (file == null || file.length() != 4 || !(file.opt("name") instanceof String)
            || !(file.opt("type") instanceof String)) {
            throw new IllegalArgumentException("Campos de metadata inválidos");
        }
        String name = file.getString("name");
        String type = file.getString("type");
        long size = safeInteger(file.opt("size"));
        long lastModified = safeInteger(file.opt("lastModified"));
        return new JSObject().put("name", name).put("size", size).put("type", type).put("lastModified", lastModified);
    }

    private long safeInteger(Object value) {
        if (!(value instanceof Number)) throw new IllegalArgumentException("Número inválido");
        double number = ((Number) value).doubleValue();
        if (Double.isNaN(number) || Double.isInfinite(number) || number < 0
            || number > 9_007_199_254_740_991d || Math.floor(number) != number) {
            throw new IllegalArgumentException("Número inválido");
        }
        return (long) number;
    }

    private boolean respond(int session, BluetoothDevice device, int requestId, int status) {
        if (session != generation || server == null) return false;
        try {
            return server.sendResponse(device, requestId, status, 0, null);
        } catch (RuntimeException error) {
            stopSession("La conexión Bluetooth se interrumpió. Vuelve a activar la recepción.");
            return false;
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        main.post(() -> {
            stopSession("Recepción detenida.");
            call.resolve();
        });
    }

    private void stopSession(String reason) {
        boolean wasRunning = active || pendingStart != null || server != null;
        generation++;
        active = false;
        frames.clear();
        if (startupTimeout != null) main.removeCallbacks(startupTimeout);
        if (monitor != null) main.removeCallbacks(monitor);
        startupTimeout = null;
        monitor = null;
        if (advertiser != null && advertisingCallback != null) {
            try { advertiser.stopAdvertising(advertisingCallback); } catch (RuntimeException ignored) { }
        }
        advertisingCallback = null;
        advertiser = null;
        if (server != null) {
            try { server.close(); } catch (RuntimeException ignored) { }
        }
        server = null;
        adapter = null;
        if (pendingStart != null) {
            PluginCall call = pendingStart;
            pendingStart = null;
            call.reject(reason);
        }
        if (wasRunning) notifyListeners("receiverStopped", new JSObject().put("reason", reason));
    }

    @Override
    protected void handleOnStart() {
        foreground = true;
    }

    @Override
    protected void handleOnStop() {
        foreground = false;
        stopSession("La recepción se detuvo al salir de NovaCart.");
    }

    @Override
    protected void handleOnDestroy() {
        destroyed = true;
        foreground = false;
        stopSession("La recepción se detuvo al cerrar NovaCart.");
    }
}
