import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BleDevice, BleService } from '@capacitor-community/bluetooth-le';
import { encodeFileMetadata, FileMetadata } from '../core/file-metadata';
import { BleMetadataService, BleTarget, NOVACART_TARGET, normalizeBleTarget } from './ble-metadata.service';

const mocks = vi.hoisted(() => ({
  platform: vi.fn(), initialize: vi.fn(), isEnabled: vi.fn(), requestEnable: vi.fn(),
  setDisplayStrings: vi.fn(), requestDevice: vi.fn(), connect: vi.fn(), getServices: vi.fn(),
  write: vi.fn(), disconnect: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: mocks.platform } }));
vi.mock('@capacitor-community/bluetooth-le', () => ({ BleClient: mocks }));

const device: BleDevice = { deviceId: 'device-1', name: 'NovaCart receptor' };
const metadata: FileMetadata = { name: 'Lista México 📄.pdf', size: 2048, type: 'application/pdf', lastModified: 1700000000000 };
const externalTarget: BleTarget = {
  service: '0000ffe0-0000-1000-8000-00805f9b34fb',
  characteristic: '0000ffe1-0000-1000-8000-00805f9b34fb',
  format: 'json-lines',
};

function services(target = NOVACART_TARGET, write = true): BleService[] {
  return [{
    uuid: target.service,
    characteristics: [{
      uuid: target.characteristic,
      descriptors: [],
      properties: { broadcast: false, read: false, writeWithoutResponse: true, write,
        notify: false, indicate: false, authenticatedSignedWrites: false },
    }],
  }];
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

function frames(): Uint8Array[] {
  return mocks.write.mock.calls.map(call => {
    const value = call[3] as DataView;
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  });
}

describe('Envío de metadata mediante Bluetooth LE', () => {
  let service: BleMetadataService;

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.platform.mockReturnValue('android');
    mocks.initialize.mockResolvedValue(undefined);
    mocks.isEnabled.mockResolvedValue(true);
    mocks.requestEnable.mockResolvedValue(undefined);
    mocks.setDisplayStrings.mockResolvedValue(undefined);
    mocks.requestDevice.mockResolvedValue(device);
    mocks.connect.mockResolvedValue(undefined);
    mocks.getServices.mockResolvedValue(services());
    mocks.write.mockResolvedValue(undefined);
    mocks.disconnect.mockResolvedValue(undefined);
    service = new BleMetadataService();
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it('prepara permisos sin localización y pide habilitar Bluetooth cuando está apagado', async () => {
    mocks.isEnabled.mockResolvedValue(false);
    await service.initialize();
    expect(mocks.initialize).toHaveBeenCalledWith({ androidNeverForLocation: true });
    expect(mocks.requestEnable).toHaveBeenCalledOnce();
    expect(mocks.setDisplayStrings).toHaveBeenCalledWith(expect.objectContaining({ cancel: 'Cancelar' }));
  });

  it('permite reintentar preparación después de rechazar permisos', async () => {
    mocks.initialize.mockRejectedValueOnce(new Error('Permission denied'));
    await expect(service.initialize()).rejects.toThrow('Permite el acceso');
    await service.initialize();
    expect(mocks.initialize).toHaveBeenCalledTimes(2);
  });

  it('rechaza web insegura o sin soporte antes de llamar al plugin', async () => {
    mocks.platform.mockReturnValue('web');
    vi.stubGlobal('window', { isSecureContext: false });
    await expect(service.initialize()).rejects.toThrow('HTTPS o localhost');
    vi.stubGlobal('window', { isSecureContext: true });
    vi.stubGlobal('navigator', {});
    await expect(service.initialize()).rejects.toThrow('no admite Web Bluetooth');
    expect(mocks.initialize).not.toHaveBeenCalled();
  });

  it('abre el selector directamente en el clic usando un filtro de servicio', async () => {
    mocks.platform.mockReturnValue('web');
    vi.stubGlobal('window', { isSecureContext: true });
    vi.stubGlobal('navigator', { bluetooth: {} });
    await service.initialize();
    const selection = service.selectDevice({ ...NOVACART_TARGET, service: NOVACART_TARGET.service.toUpperCase() });
    // No await between the click and requestDevice.
    expect(mocks.requestDevice).toHaveBeenCalledWith({ services: [NOVACART_TARGET.service] });
    await expect(selection).resolves.toEqual(device);
  });

  it('requiere preparación antes del selector y traduce la cancelación del sistema', async () => {
    await expect(service.selectDevice(NOVACART_TARGET)).rejects.toMatchObject({ code: 'not-ready' });
    await service.initialize();
    mocks.requestDevice.mockRejectedValue(Object.assign(new Error('User cancelled the requestDevice chooser.'), { name: 'NotFoundError' }));
    await expect(service.selectDevice(NOVACART_TARGET)).rejects.toMatchObject({ code: 'cancelled' });
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it('acepta UUID completos y rechaza destinos incorrectos antes de buscar o conectar', async () => {
    expect(normalizeBleTarget({ ...NOVACART_TARGET, service: ` ${NOVACART_TARGET.service.toUpperCase()} ` })).toEqual(NOVACART_TARGET);
    await expect(service.sendMetadata(device, metadata, { ...NOVACART_TARGET, characteristic: 'fff1' })).rejects.toMatchObject({ code: 'invalid-target' });
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it('envía frames de 20 bytes como máximo y reconstruye exactamente la metadata Unicode', async () => {
    const progress = vi.fn();
    await service.sendMetadata(device, metadata, NOVACART_TARGET, progress);
    const sent = frames();
    const payload = encodeFileMetadata(metadata);
    expect(sent[0][0]).toBe(0x01);
    expect(new DataView(sent[0].buffer).getUint32(1, true)).toBe(payload.byteLength);
    expect(sent.at(-1)).toEqual(new Uint8Array([0x03]));
    expect(sent.every(frame => frame.byteLength <= 20)).toBe(true);
    expect(sent.slice(1, -1).every(frame => frame[0] === 0x02)).toBe(true);
    const reassembled = new Uint8Array(sent.slice(1, -1).flatMap(frame => Array.from(frame.subarray(1))));
    // TextEncoder belongs to Node's realm in jsdom; compare bytes across realms.
    expect(Array.from(reassembled)).toEqual(Array.from(payload));
    expect(JSON.parse(new TextDecoder().decode(reassembled))).toEqual({ version: 1, type: 'file-metadata', file: metadata });
    expect(progress).toHaveBeenLastCalledWith(payload.byteLength, payload.byteLength);
    expect(mocks.disconnect).toHaveBeenCalledWith(device.deviceId);
    expect(mocks.write.mock.calls.every(call => call[1] === NOVACART_TARGET.service && call[2] === NOVACART_TARGET.characteristic)).toBe(true);
  });

  it('espera cada respuesta GATT y no marca 100% hasta la confirmación de commit', async () => {
    const first = deferred<void>();
    const commit = deferred<void>();
    const progress = vi.fn();
    mocks.write.mockImplementation((_id: string, _service: string, _char: string, value: DataView) => {
      if (value.getUint8(0) === 0x01) return first.promise;
      if (value.getUint8(0) === 0x03) return commit.promise;
      return Promise.resolve();
    });
    const sending = service.sendMetadata(device, metadata, NOVACART_TARGET, progress);
    await vi.waitFor(() => expect(mocks.write).toHaveBeenCalledOnce());
    expect(progress).not.toHaveBeenCalled();
    first.resolve();
    await vi.waitFor(() => expect(frames().at(-1)?.[0]).toBe(0x03));
    expect(progress.mock.calls.some(([sent, total]) => sent === total)).toBe(false);
    commit.resolve();
    await sending;
    expect(progress).toHaveBeenLastCalledWith(encodeFileMetadata(metadata).byteLength, encodeFileMetadata(metadata).byteLength);
  });

  it('fragmenta metadata grande y comienza desde cero al repetir un envío fallido', async () => {
    const large = { ...metadata, name: 'á📄'.repeat(500) + '.pdf' };
    mocks.write.mockRejectedValueOnce(new Error('GATT write failed'));
    await expect(service.sendMetadata(device, large, NOVACART_TARGET)).rejects.toMatchObject({ code: 'failed' });
    mocks.write.mockClear();
    await service.sendMetadata(device, large, NOVACART_TARGET);
    expect(frames().length).toBeGreaterThan(100);
    expect(frames()[0][0]).toBe(0x01);
    expect(mocks.disconnect).toHaveBeenCalledTimes(2);
  });

  it('envía al periférico externo JSON UTF-8 más LF, sin frames NovaCart', async () => {
    mocks.getServices.mockResolvedValue(services(externalTarget));
    await service.sendMetadata(device, metadata, externalTarget);
    const sent = frames();
    const line = new Uint8Array(sent.flatMap(frame => Array.from(frame)));
    expect(new TextDecoder().decode(line)).toBe(`${new TextDecoder().decode(encodeFileMetadata(metadata))}\n`);
    expect(sent.every(frame => frame.byteLength <= 20)).toBe(true);
    expect(mocks.write).toHaveBeenCalledWith(device.deviceId, externalTarget.service, externalTarget.characteristic, expect.any(DataView), { timeout: 10_000 });
  });

  it.each(['missing-service', 'missing-characteristic', 'without-response-only'])('rechaza receptor incompatible: %s', async kind => {
    const advertised = services(NOVACART_TARGET, kind !== 'without-response-only');
    mocks.getServices.mockResolvedValue(kind === 'missing-service' ? [] : kind === 'missing-characteristic'
      ? [{ ...advertised[0], characteristics: [] }] : advertised);
    await expect(service.sendMetadata(device, metadata, NOVACART_TARGET)).rejects.toMatchObject({ code: 'unsupported' });
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.disconnect).toHaveBeenCalledOnce();
  });

  it('cancela antes de conectar y rechaza metadata excesiva sin abrir conexión', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(service.sendMetadata(device, metadata, NOVACART_TARGET, undefined, controller.signal)).rejects.toMatchObject({ code: 'cancelled' });
    await expect(service.sendMetadata(device, { ...metadata, name: 'x'.repeat(17_000) }, NOVACART_TARGET)).rejects.toMatchObject({ code: 'invalid-metadata' });
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it('cancela durante conexión y limpia aun si ésta se completa después de cancelar', async () => {
    const connection = deferred<void>();
    const controller = new AbortController();
    mocks.connect.mockReturnValue(connection.promise);
    const sending = service.sendMetadata(device, metadata, NOVACART_TARGET, undefined, controller.signal);
    const rejection = expect(sending).rejects.toMatchObject({ code: 'cancelled' });
    await vi.waitFor(() => expect(mocks.connect).toHaveBeenCalled());
    controller.abort();
    connection.resolve();
    await rejection;
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.disconnect).toHaveBeenCalledOnce();
  });

  it('cancela durante escritura sin continuar, avanzar progreso ni permitir envíos concurrentes', async () => {
    const write = deferred<void>();
    const controller = new AbortController();
    const progress = vi.fn();
    mocks.write.mockReturnValueOnce(write.promise);
    const sending = service.sendMetadata(device, metadata, NOVACART_TARGET, progress, controller.signal);
    const rejection = expect(sending).rejects.toMatchObject({ code: 'cancelled' });
    await vi.waitFor(() => expect(mocks.write).toHaveBeenCalledOnce());
    await expect(service.sendMetadata(device, metadata, NOVACART_TARGET)).rejects.toMatchObject({ code: 'busy' });
    controller.abort();
    await rejection;
    write.resolve();
    await Promise.resolve();
    expect(mocks.write).toHaveBeenCalledOnce();
    expect(progress).not.toHaveBeenCalled();
    expect(mocks.disconnect).toHaveBeenCalledOnce();
  });

  it('rechaza desconexión inesperada en mitad de un envío y nunca publica progreso tardío', async () => {
    const write = deferred<void>();
    const progress = vi.fn();
    let disconnect!: () => void;
    mocks.connect.mockImplementation((_id: string, onDisconnect: () => void) => { disconnect = onDisconnect; return Promise.resolve(); });
    mocks.write.mockReturnValueOnce(write.promise);
    const sending = service.sendMetadata(device, metadata, NOVACART_TARGET, progress);
    const rejection = expect(sending).rejects.toMatchObject({ code: 'disconnected' });
    await vi.waitFor(() => expect(mocks.write).toHaveBeenCalledOnce());
    disconnect();
    await rejection;
    write.resolve();
    await Promise.resolve();
    expect(progress).not.toHaveBeenCalled();
    expect(mocks.write).toHaveBeenCalledOnce();
    expect(mocks.disconnect).toHaveBeenCalledOnce();
  });

  it('intenta desconectar tras una conexión parcial fallida y conserva el error si la limpieza falla', async () => {
    mocks.connect.mockRejectedValue(new Error('connection failed: private body must not leak'));
    mocks.disconnect.mockRejectedValue(new Error('already disconnected'));
    await expect(service.sendMetadata(device, metadata, NOVACART_TARGET)).rejects.toThrow('No se confirmó el envío');
    expect(mocks.disconnect).toHaveBeenCalledWith(device.deviceId);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('rechaza commit no confirmado sin informar éxito', async () => {
    const progress = vi.fn();
    mocks.write.mockImplementation((_id: string, _service: string, _char: string, value: DataView) =>
      value.getUint8(0) === 0x03 ? Promise.reject(new Error('invalid metadata')) : Promise.resolve());
    await expect(service.sendMetadata(device, metadata, NOVACART_TARGET, progress)).rejects.toMatchObject({ code: 'failed' });
    expect(progress.mock.calls.some(([sent, total]) => sent === total)).toBe(false);
    expect(mocks.disconnect).toHaveBeenCalledOnce();
  });

  it('la desconexión intencional al terminar no convierte un envío confirmado en error', async () => {
    let disconnect!: () => void;
    mocks.connect.mockImplementation((_id: string, onDisconnect: () => void) => { disconnect = onDisconnect; return Promise.resolve(); });
    mocks.disconnect.mockImplementation(() => { disconnect(); return Promise.resolve(); });
    await expect(service.sendMetadata(device, metadata, NOVACART_TARGET)).resolves.toBeUndefined();
  });
});
