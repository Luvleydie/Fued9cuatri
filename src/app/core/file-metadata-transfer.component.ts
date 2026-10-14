import { ChangeDetectorRef, Component, Input, OnChanges, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { BleDevice } from '@capacitor-community/bluetooth-le';
import { FileMetadata, getFileMetadata } from './file-metadata';
import { BleMetadataError, BleMetadataService, BleTarget, NOVACART_TARGET } from '../services/ble-metadata.service';
import { MetadataReceiverService, ReceivedMetadata } from '../services/metadata-receiver';

@Component({
  selector: 'app-file-metadata-transfer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './file-metadata-transfer.component.html',
  styleUrl: './file-metadata-transfer.component.scss',
})
export class FileMetadataTransferComponent implements OnChanges, OnDestroy {
  @Input() active = true;
  readonly canReceive = Capacitor.getPlatform() === 'android';
  metadata: FileMetadata | null = null;
  device: BleDevice | null = null;
  targetKind: 'novacart' | 'external' = 'novacart';
  externalService = '';
  externalCharacteristic = '';
  ready = false;
  preparing = false;
  choosing = false;
  sending = false;
  progress = 0;
  status = '';
  error = '';
  receiving = false;
  receiverBusy = false;
  receiverName = '';
  receiverError = '';
  receiverStatus = '';
  received: ReceivedMetadata | null = null;
  private generation = 0;
  private transfer?: AbortController;
  private receiverListeners: PluginListenerHandle[] = [];

  constructor(private ble: BleMetadataService, private cdr: ChangeDetectorRef, private receiver: MetadataReceiverService) {}

  get busy(): boolean { return this.preparing || this.choosing || this.sending; }
  get target(): BleTarget {
    return this.targetKind === 'novacart' ? { ...NOVACART_TARGET } : {
      service: this.externalService.trim().toLowerCase(),
      characteristic: this.externalCharacteristic.trim().toLowerCase(),
      format: 'json-lines',
    };
  }
  get targetValid(): boolean {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuid.test(this.target.service) && uuid.test(this.target.characteristic);
  }

  ngOnChanges(): void { if (!this.active) this.suspend(); }
  ngOnDestroy(): void { this.suspend(); }

  displayDate(value: number): Date | null {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  chooseFile(event: Event): void {
    if (this.busy || !this.active) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.metadata = file ? getFileMetadata(file) : null;
    this.status = '';
    this.error = '';
    this.progress = 0;
    // Retain only metadata; allow choosing the same file again.
    input.value = '';
  }

  changeTarget(event: Event): void {
    if (this.busy) return;
    this.targetKind = (event.target as HTMLSelectElement).value === 'external' ? 'external' : 'novacart';
    this.clearDevice();
  }

  configureTarget(field: 'service' | 'characteristic', event: Event): void {
    if (this.busy) return;
    const value = (event.target as HTMLInputElement).value;
    if (field === 'service') this.externalService = value;
    else this.externalCharacteristic = value;
    this.clearDevice();
  }

  private clearDevice(): void {
    this.device = null;
    this.status = '';
    this.error = '';
    this.progress = 0;
  }

  async prepare(): Promise<void> {
    if (!this.active || this.busy || this.receiving || this.receiverBusy) return;
    const generation = this.generation;
    this.preparing = true;
    this.error = '';
    this.status = '';
    try {
      await this.ble.initialize();
      if (generation !== this.generation) return;
      this.ready = true;
      this.status = 'Bluetooth listo. Elige el dispositivo de destino.';
    } catch (error) {
      if (generation === this.generation) this.error = this.message(error);
    } finally {
      if (generation === this.generation) { this.preparing = false; this.cdr.markForCheck(); }
    }
  }

  async chooseDevice(): Promise<void> {
    if (!this.active || !this.ready || this.busy || !this.metadata || !this.targetValid || this.receiving || this.receiverBusy) return;
    const generation = this.generation;
    this.choosing = true;
    this.clearDevice();
    try {
      // This call stays in the click handler to preserve Web Bluetooth's user gesture.
      const device = await this.ble.selectDevice(this.target);
      if (generation !== this.generation) return;
      this.device = device;
      this.status = 'Destino seleccionado. Revisa el archivo y pulsa Enviar metadata.';
    } catch (error) {
      if (generation === this.generation) {
        if (error instanceof BleMetadataError && error.code === 'cancelled') this.status = 'Selección cancelada. Puedes elegir otro dispositivo.';
        else this.error = this.message(error);
      }
    } finally {
      if (generation === this.generation) { this.choosing = false; this.cdr.markForCheck(); }
    }
  }

  async send(): Promise<void> {
    if (!this.active || !this.ready || this.busy || !this.metadata || !this.device || !this.targetValid || this.receiving || this.receiverBusy) return;
    const generation = this.generation;
    const file = { ...this.metadata };
    const device = { ...this.device };
    const target = this.target;
    this.transfer = new AbortController();
    this.sending = true;
    this.progress = 0;
    this.error = '';
    this.status = 'Conectando con el destino…';
    try {
      await this.ble.sendMetadata(device, file, target, (sent, total) => {
        if (generation !== this.generation) return;
        this.progress = Math.floor(sent / total * 100);
        this.status = `Enviando metadata a ${device.name || device.deviceId}…`;
        this.cdr.markForCheck();
      }, this.transfer.signal);
      if (generation !== this.generation) return;
      this.progress = 100;
      this.status = target.format === 'novacart'
        ? `Metadata de «${file.name}» recibida por ${device.name || device.deviceId}.`
        : `Metadata de «${file.name}» escrita en ${device.name || device.deviceId}. Comprueba su recepción en el dispositivo.`;
    } catch (error) {
      if (generation === this.generation) {
        this.status = '';
        this.error = this.message(error);
      }
    } finally {
      if (generation === this.generation) {
        this.sending = false;
        this.transfer = undefined;
        this.cdr.markForCheck();
      }
    }
  }

  cancelSend(): void { this.transfer?.abort(); }

  async startReceiving(): Promise<void> {
    if (!this.active || !this.canReceive || this.busy || this.receiverBusy || this.receiving) return;
    const generation = this.generation;
    this.receiverBusy = true;
    this.receiverError = '';
    this.receiverStatus = '';
    this.received = null;
    const listeners: PluginListenerHandle[] = [];
    try {
      await this.removeReceiverListeners();
      if (generation !== this.generation) return;
      this.receiverListeners = listeners;
      const receivedListener = await this.receiver.onMetadata(value => {
        if (generation !== this.generation) return;
        this.received = value;
        this.cdr.markForCheck();
      });
      listeners.push(receivedListener);
      if (generation !== this.generation) { await this.removeReceiverListeners(listeners); return; }
      const stoppedListener = await this.receiver.onStop(value => {
        if (generation !== this.generation) return;
        this.receiving = false;
        this.receiverStatus = value.reason || 'Recepción detenida.';
        this.cdr.markForCheck();
      });
      listeners.push(stoppedListener);
      if (generation !== this.generation) { await this.removeReceiverListeners(listeners); return; }
      const result = await this.receiver.start();
      if (generation !== this.generation) return;
      this.receiving = true;
      this.receiverName = result.name;
      this.receiverStatus = 'Esperando metadata. Mantén esta pantalla abierta.';
    } catch (error) {
      await this.removeReceiverListeners(listeners);
      if (generation === this.generation) this.receiverError = this.message(error, 'No se pudo activar la recepción. Revisa Bluetooth y el permiso de dispositivos cercanos.');
    } finally {
      if (generation === this.generation) { this.receiverBusy = false; this.cdr.markForCheck(); }
    }
  }

  async stopReceiving(): Promise<void> {
    if (this.receiverBusy) return;
    const generation = this.generation;
    const listeners = this.receiverListeners;
    this.receiverBusy = true;
    try {
      await this.receiver.stop();
      if (generation !== this.generation) return;
      this.receiving = false;
      this.receiverStatus = 'Recepción detenida.';
      await this.removeReceiverListeners(listeners);
    } catch (error) {
      if (generation === this.generation) this.receiverError = this.message(error, 'No se pudo detener la recepción. Cierra esta pantalla para volver a intentarlo.');
    } finally {
      if (generation === this.generation) { this.receiverBusy = false; this.cdr.markForCheck(); }
    }
  }

  private suspend(): void {
    this.generation++;
    this.transfer?.abort();
    this.transfer = undefined;
    this.metadata = null;
    this.clearDevice();
    this.received = null;
    this.preparing = this.choosing = this.sending = false;
    this.receiving = this.receiverBusy = false;
    this.receiverStatus = this.receiverError = this.receiverName = '';
    if (this.canReceive) void this.receiver.stop().catch(() => undefined);
    void this.removeReceiverListeners();
  }

  private async removeReceiverListeners(handles = this.receiverListeners): Promise<void> {
    if (this.receiverListeners === handles) this.receiverListeners = [];
    const listeners = handles.splice(0);
    await Promise.all(listeners.map(listener => listener.remove().catch(() => undefined)));
  }

  private message(error: unknown, fallback = 'No se pudo completar la operación Bluetooth. Revisa los permisos y acerca el dispositivo para reintentar.'): string {
    if (error instanceof BleMetadataError) return error.message;
    // Native receiver errors are written by our plugin for display to the user.
    if (this.canReceive && error instanceof Error && error.message && !error.message.includes('UNIMPLEMENTED')) return error.message;
    return fallback;
  }
}
