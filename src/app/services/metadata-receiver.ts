import { PluginListenerHandle, registerPlugin } from '@capacitor/core';
import { Injectable } from '@angular/core';
import { FileMetadata } from '../core/file-metadata';

export interface ReceivedMetadata {
  file: FileMetadata;
  deviceId: string;
}

interface MetadataReceiverPlugin {
  start(): Promise<{ name: string }>;
  stop(): Promise<void>;
  addListener(event: 'metadataReceived', listener: (value: ReceivedMetadata) => void): Promise<PluginListenerHandle>;
  addListener(event: 'receiverStopped', listener: (value: { reason: string }) => void): Promise<PluginListenerHandle>;
}

export const MetadataReceiver = registerPlugin<MetadataReceiverPlugin>('MetadataReceiver');

@Injectable({ providedIn: 'root' })
export class MetadataReceiverService {
  start(): Promise<{ name: string }> { return MetadataReceiver.start(); }
  stop(): Promise<void> { return MetadataReceiver.stop(); }
  onMetadata(listener: (value: ReceivedMetadata) => void): Promise<PluginListenerHandle> {
    return MetadataReceiver.addListener('metadataReceived', listener);
  }
  onStop(listener: (value: { reason: string }) => void): Promise<PluginListenerHandle> {
    return MetadataReceiver.addListener('receiverStopped', listener);
  }
}
