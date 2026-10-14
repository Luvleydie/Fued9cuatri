import { ChangeDetectorRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileMetadataTransferComponent } from './file-metadata-transfer.component';
import { BleMetadataError, BleMetadataService, NOVACART_TARGET } from '../services/ble-metadata.service';
import { MetadataReceiverService } from '../services/metadata-receiver';

describe('Compartir metadata desde datos de usuario', () => {
  const file = { name: 'reporte-á.pdf', size: 1250, type: 'application/pdf', lastModified: 1791763200000 };
  const destination = { deviceId: 'phone-2', name: 'Teléfono de Ana' };
  let component: FileMetadataTransferComponent;
  const MetadataReceiver = { start: vi.fn(), stop: vi.fn(), addListener: vi.fn() };
  const receiver = {
    start: MetadataReceiver.start, stop: MetadataReceiver.stop,
    onMetadata: MetadataReceiver.addListener, onStop: MetadataReceiver.addListener,
  };
  let ble: { initialize: ReturnType<typeof vi.fn>; selectDevice: ReturnType<typeof vi.fn>; sendMetadata: ReturnType<typeof vi.fn> };

  function makeComponent() {
    return new FileMetadataTransferComponent(ble as unknown as BleMetadataService, { markForCheck: vi.fn() } as unknown as ChangeDetectorRef, receiver as MetadataReceiverService);
  }
  beforeEach(() => {
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('web');
    ble = { initialize: vi.fn().mockResolvedValue(undefined), selectDevice: vi.fn().mockResolvedValue(destination), sendMetadata: vi.fn().mockResolvedValue(undefined) };
    vi.mocked(MetadataReceiver.stop).mockResolvedValue(undefined);
    vi.mocked(MetadataReceiver.start).mockResolvedValue({ name: 'Mi teléfono' });
    vi.mocked(MetadataReceiver.addListener).mockImplementation(async () => ({ remove: vi.fn().mockResolvedValue(undefined) }));
    component = makeComponent();
  });
  afterEach(() => { component.ngOnDestroy(); vi.restoreAllMocks(); vi.clearAllMocks(); });

  it('selecciona solo metadata, exige destino y espera el envío explícito', async () => {
    const arrayBuffer = vi.fn();
    const input = { files: [{ ...file, arrayBuffer, path: 'privado', contents: 'secreto' }], value: 'reporte-á.pdf' };
    component.chooseFile({ target: input } as unknown as Event);
    expect(component.metadata).toEqual(file);
    expect(input.value).toBe('');
    await component.send();
    expect(ble.sendMetadata).not.toHaveBeenCalled();
    await component.prepare();
    await component.chooseDevice();
    expect(component.device).toEqual(destination);
    expect(ble.sendMetadata).not.toHaveBeenCalled();
    await component.send();
    expect(ble.sendMetadata).toHaveBeenCalledWith(destination, file, NOVACART_TARGET, expect.any(Function), expect.any(AbortSignal));
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(component.status).toContain('recibida por Teléfono de Ana');
  });

  it('cambiar tipo o UUID invalida el destino previamente elegido', () => {
    component.device = destination;
    component.changeTarget({ target: { value: 'external' } } as unknown as Event);
    expect(component.device).toBeNull();
    expect(component.targetValid).toBe(false);
    component.configureTarget('service', { target: { value: NOVACART_TARGET.service.toUpperCase() } } as unknown as Event);
    component.configureTarget('characteristic', { target: { value: NOVACART_TARGET.characteristic } } as unknown as Event);
    expect(component.targetValid).toBe(true);
    expect(component.target.format).toBe('json-lines');
    component.device = destination;
    component.configureTarget('characteristic', { target: { value: '' } } as unknown as Event);
    expect(component.device).toBeNull();
  });

  it('evita que una fecha numérica fuera del rango Date rompa la vista', () => {
    expect(component.displayDate(9_000_000_000_000_000)).toBeNull();
    expect(component.displayDate(0)?.getTime()).toBe(0);
    expect(component.displayDate(file.lastModified)?.getTime()).toBe(file.lastModified);
  });

  it('permite corregir permisos y reintentar la preparación', async () => {
    ble.initialize.mockRejectedValueOnce(new BleMetadataError('failed', 'Permite el acceso a Bluetooth.'));
    await component.prepare();
    expect(component.ready).toBe(false);
    expect(component.error).toContain('Permite');
    await component.prepare();
    expect(component.ready).toBe(true);
    expect(component.error).toBe('');
  });

  it('cancelar el selector quita el destino anterior y no envía', async () => {
    component.ready = true;
    component.metadata = file;
    component.device = destination;
    ble.selectDevice.mockRejectedValueOnce(new BleMetadataError('cancelled', 'Cancelado'));
    await component.chooseDevice();
    expect(component.device).toBeNull();
    expect(component.error).toBe('');
    expect(component.status).toContain('cancelada');
    expect(ble.sendMetadata).not.toHaveBeenCalled();
  });

  it('un error de transmisión nunca se presenta como recepción completa', async () => {
    component.ready = true;
    component.metadata = file;
    component.device = destination;
    ble.sendMetadata.mockRejectedValue(new BleMetadataError('disconnected', 'Destino desconectado.'));
    await component.send();
    expect(component.status).toBe('');
    expect(component.error).toBe('Destino desconectado.');
    expect(component.sending).toBe(false);
  });

  it('salir cancela un envío y descarta su resultado tardío y la metadata seleccionada', async () => {
    let finish!: () => void;
    ble.sendMetadata.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    component.ready = true;
    component.metadata = file;
    component.device = destination;
    const pending = component.send();
    await component.send();
    expect(ble.sendMetadata).toHaveBeenCalledOnce();
    const signal = ble.sendMetadata.mock.calls[0][4] as AbortSignal;
    component.active = false;
    component.ngOnChanges();
    expect(signal.aborted).toBe(true);
    finish();
    await pending;
    expect(component.metadata).toBeNull();
    expect(component.device).toBeNull();
    expect(component.status).toBe('');
  });

  it('la selección tardía no restaura datos después de salir', async () => {
    let finish!: (value: typeof destination) => void;
    ble.selectDevice.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    component.ready = true;
    component.metadata = file;
    const pending = component.chooseDevice();
    component.active = false;
    component.ngOnChanges();
    finish(destination);
    await pending;
    expect(component.device).toBeNull();
  });

  it('el receptor Android se inicia por acción explícita y cierra al salir', async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
    component = makeComponent();
    expect(MetadataReceiver.start).not.toHaveBeenCalled();
    await component.startReceiving();
    expect(component.receiving).toBe(true);
    expect(component.receiverName).toBe('Mi teléfono');
    await component.prepare();
    expect(ble.initialize).not.toHaveBeenCalled();
    component.active = false;
    component.ngOnChanges();
    expect(MetadataReceiver.stop).toHaveBeenCalledOnce();
    expect(component.receiving).toBe(false);
  });

  it('un inicio antiguo no detiene ni elimina listeners del receptor nuevo', async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
    component = makeComponent();
    let failFirst!: (value: Error) => void;
    vi.mocked(MetadataReceiver.start).mockReturnValueOnce(new Promise((_resolve, reject) => { failFirst = reject; }));
    const removeOld = vi.fn().mockResolvedValue(undefined);
    const removeNew = vi.fn().mockResolvedValue(undefined);
    vi.mocked(MetadataReceiver.addListener)
      .mockResolvedValueOnce({ remove: removeOld }).mockResolvedValueOnce({ remove: removeOld })
      .mockResolvedValue({ remove: removeNew });
    const old = component.startReceiving();
    await vi.waitFor(() => expect(MetadataReceiver.start).toHaveBeenCalledOnce());
    component.active = false;
    component.ngOnChanges();
    component.active = true;
    component.ngOnChanges();
    await component.startReceiving();
    failFirst(new Error('Inicio cancelado al salir'));
    await old;
    expect(component.receiving).toBe(true);
    expect(component.receiverError).toBe('');
    expect(removeNew).not.toHaveBeenCalled();
    expect(MetadataReceiver.stop).toHaveBeenCalledOnce();
  });

  it('el navegador muestra la vista previa y evita enviar antes de seleccionar un destino', async () => {
    await TestBed.configureTestingModule({
      imports: [FileMetadataTransferComponent],
      providers: [{ provide: BleMetadataService, useValue: ble }, { provide: MetadataReceiverService, useValue: receiver }],
    }).compileComponents();
    const fixture = TestBed.createComponent(FileMetadataTransferComponent);
    component = fixture.componentInstance;
    component.metadata = file;
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-testid="metadata-preview"]')?.textContent).toContain(file.name);
    const send = [...element.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Enviar metadata');
    expect(send?.disabled).toBe(true);
    expect(element.textContent).toContain('app Android');
    fixture.destroy();
  });
});
