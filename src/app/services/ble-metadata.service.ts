import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { BleClient, BleDevice } from '@capacitor-community/bluetooth-le';
import { encodeFileMetadata, FileMetadata } from '../core/file-metadata';

export interface BleTarget {
  service: string;
  characteristic: string;
  format: 'novacart' | 'json-lines';
}

export const NOVACART_TARGET: BleTarget = Object.freeze({
  service: '7d2ea28a-f7bd-485a-bd9d-92ad6ecfe93e',
  characteristic: '7d2ea28b-f7bd-485a-bd9d-92ad6ecfe93e',
  format: 'novacart',
});

type BleMetadataErrorCode = 'cancelled' | 'unsupported' | 'invalid-target' | 'invalid-metadata'
  | 'disconnected' | 'failed' | 'busy' | 'not-ready';

export class BleMetadataError extends Error {
  constructor(readonly code: BleMetadataErrorCode, message: string) {
    super(message);
    this.name = 'BleMetadataError';
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeBleTarget(target: BleTarget): BleTarget {
  const service = target.service.trim().toLowerCase();
  const characteristic = target.characteristic.trim().toLowerCase();
  if (!UUID_PATTERN.test(service) || !UUID_PATTERN.test(characteristic)
    || !['novacart', 'json-lines'].includes(target.format)) {
    throw new BleMetadataError('invalid-target', 'Ingresa UUID de servicio y característica completos (128 bits), según el dispositivo BLE.');
  }
  return { service, characteristic, format: target.format };
}

function cancelled(): BleMetadataError {
  return new BleMetadataError('cancelled', 'Envío Bluetooth cancelado. Puedes seleccionar otro destino e intentarlo de nuevo.');
}

function readableError(error: unknown, fallback: string, selecting = false): BleMetadataError {
  if (error instanceof BleMetadataError) return error;
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  // Use plugin messages only for classification; never show raw values in the UI.
  if (/cancel|abort/i.test(`${name} ${message}`) || (selecting && name === 'NotFoundError')) {
    return cancelled();
  }
  if (/permission|denied|notallowed|unauthorized/i.test(`${name} ${message}`)) {
    return new BleMetadataError('failed', 'Permite el acceso a Bluetooth y Dispositivos cercanos en los ajustes de la app o del navegador, y vuelve a intentarlo.');
  }
  if (/disabled|not enabled|powered off|turned off/i.test(message)) {
    return new BleMetadataError('failed', 'Activa Bluetooth en el dispositivo y vuelve a intentarlo.');
  }
  if (/unsupported|not supported|unavailable|not available/i.test(message)) {
    return new BleMetadataError('unsupported', 'Bluetooth LE no está disponible. Usa la app Android o un navegador compatible con Web Bluetooth.');
  }
  return new BleMetadataError('failed', fallback);
}

@Injectable({ providedIn: 'root' })
export class BleMetadataService {
  private ready = false;
  private initializing?: Promise<void>;
  private sending = false;

  async initialize(): Promise<void> {
    this.assertSupported();
    if (this.ready) return;
    if (this.initializing) return this.initializing;
    this.initializing = this.prepare().then(() => {
      this.ready = true;
    }, (error: unknown) => {
      throw readableError(error, 'No se pudo activar Bluetooth. Revisa los permisos y vuelve a intentarlo.');
    }).finally(() => {
      this.initializing = undefined;
    });
    return this.initializing;
  }

  /** Call directly from a click after initialize(), preserving the browser's user gesture. */
  async selectDevice(target: BleTarget): Promise<BleDevice> {
    this.assertSupported();
    const normalized = normalizeBleTarget(target);
    if (!this.ready) {
      throw new BleMetadataError('not-ready', 'Primero activa Bluetooth y después pulsa Elegir destino.');
    }
    if (this.sending) throw new BleMetadataError('busy', 'Espera a que termine el envío Bluetooth actual.');
    try {
      return await BleClient.requestDevice({ services: [normalized.service] });
    } catch (error) {
      throw readableError(error, 'No se pudo elegir un destino. Acerca el dispositivo, activa su recepción BLE y vuelve a intentarlo.', true);
    }
  }

  async sendMetadata(
    device: BleDevice,
    metadata: FileMetadata,
    target: BleTarget,
    onProgress?: (sent: number, total: number) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    if (this.sending) throw new BleMetadataError('busy', 'Espera a que termine el envío Bluetooth actual.');
    if (signal?.aborted) throw cancelled();
    const normalized = normalizeBleTarget(target);
    if (!device?.deviceId) throw new BleMetadataError('invalid-target', 'Selecciona un dispositivo Bluetooth de destino.');
    let payload: Uint8Array;
    try {
      payload = encodeFileMetadata(metadata);
    } catch (error) {
      throw new BleMetadataError('invalid-metadata', error instanceof Error ? error.message : 'La metadata del archivo no es válida.');
    }

    this.sending = true;
    let failure: BleMetadataError | undefined;
    let disconnecting = false;
    let connectionAttempted = false;
    let rejectInterruption!: (error: BleMetadataError) => void;
    const interruption = new Promise<never>((_, reject) => { rejectInterruption = reject; });
    // An abort can occur before an asynchronous operation has attached its race handler.
    void interruption.catch(() => undefined);
    const interrupt = (error: BleMetadataError) => {
      if (!failure) {
        failure = error;
        rejectInterruption(error);
      }
    };
    const onAbort = () => interrupt(cancelled());
    const checkActive = () => {
      if (signal?.aborted) onAbort();
      if (failure) throw failure;
    };
    const step = async <T>(operation: () => Promise<T>): Promise<T> => {
      checkActive();
      const value = await Promise.race([operation(), interruption]);
      checkActive();
      return value;
    };
    const write = async (frame: Uint8Array): Promise<void> => {
      await step(() => BleClient.write(device.deviceId, normalized.service, normalized.characteristic,
        new DataView(frame.buffer, frame.byteOffset, frame.byteLength), { timeout: 10_000 }));
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      await step(() => this.initialize());
      checkActive();
      connectionAttempted = true;
      // Wait for the connect attempt to settle before cleanup, even if cancelled while connecting.
      await BleClient.connect(device.deviceId, () => {
        if (!disconnecting) {
          interrupt(new BleMetadataError('disconnected', 'El destino se desconectó antes de confirmar el envío. Acércalo, activa su recepción BLE y vuelve a intentarlo.'));
        }
      }, { timeout: 15_000 });
      checkActive();
      const services = await step(() => BleClient.getServices(device.deviceId));
      const characteristic = services.find(service => service.uuid.toLowerCase() === normalized.service)
        ?.characteristics.find(value => value.uuid.toLowerCase() === normalized.characteristic);
      if (!characteristic?.properties.write) {
        throw new BleMetadataError('unsupported', 'El destino no tiene la característica BLE configurada con escritura y respuesta. Revisa los UUID o activa Recibir en NovaCart.');
      }

      if (normalized.format === 'novacart') {
        const begin = new Uint8Array(5);
        begin[0] = 0x01;
        new DataView(begin.buffer).setUint32(1, payload.byteLength, true);
        await write(begin);
        onProgress?.(0, payload.byteLength);
        for (let offset = 0; offset < payload.byteLength; offset += 19) {
          const chunk = payload.subarray(offset, offset + 19);
          const frame = new Uint8Array(chunk.byteLength + 1);
          frame[0] = 0x02;
          frame.set(chunk, 1);
          await write(frame);
          const sent = offset + chunk.byteLength;
          // 100% is reserved for the receiver's validated commit response.
          if (sent < payload.byteLength) onProgress?.(sent, payload.byteLength);
        }
        await write(new Uint8Array([0x03]));
        onProgress?.(payload.byteLength, payload.byteLength);
      } else {
        const line = new Uint8Array(payload.byteLength + 1);
        line.set(payload);
        line[line.byteLength - 1] = 0x0a;
        onProgress?.(0, line.byteLength);
        for (let offset = 0; offset < line.byteLength; offset += 20) {
          const chunk = line.subarray(offset, offset + 20);
          await write(chunk);
          onProgress?.(offset + chunk.byteLength, line.byteLength);
        }
      }
      checkActive();
    } catch (error) {
      throw failure ?? readableError(error, 'No se confirmó el envío de metadata. Revisa la conexión y el protocolo del receptor e inténtalo de nuevo.');
    } finally {
      signal?.removeEventListener('abort', onAbort);
      disconnecting = true;
      try {
        if (connectionAttempted) await BleClient.disconnect(device.deviceId);
      } catch {
        // A failed/closed connection may also reject disconnect; preserve the transfer result.
      } finally {
        this.sending = false;
      }
    }
  }

  private assertSupported(): void {
    if (Capacitor.getPlatform() !== 'web') return;
    if (typeof window === 'undefined' || window.isSecureContext !== true) {
      throw new BleMetadataError('unsupported', 'Para usar Bluetooth en el navegador, abre NovaCart mediante HTTPS o localhost.');
    }
    if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
      throw new BleMetadataError('unsupported', 'Este navegador no admite Web Bluetooth. Usa Chrome/Edge compatible o la app Android.');
    }
  }

  private async prepare(): Promise<void> {
    await BleClient.initialize({ androidNeverForLocation: true });
    if (!(await BleClient.isEnabled())) {
      if (Capacitor.getPlatform() === 'android') await BleClient.requestEnable();
      else throw new BleMetadataError('failed', 'Activa Bluetooth en los ajustes del dispositivo y vuelve a intentarlo.');
    }
    await BleClient.setDisplayStrings({
      scanning: 'Buscando destinos BLE…',
      cancel: 'Cancelar',
      availableDevices: 'Destinos Bluetooth',
      noDeviceFound: 'No hay destinos compatibles. Activa la recepción BLE.',
    });
  }
}
