import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.novacart.app',
  appName: 'NovaCart',
  webDir: 'www-mobile',
  plugins: {
    BluetoothLe: {
      displayStrings: {
        scanning: 'Buscando dispositivos Bluetooth…',
        cancel: 'Cancelar',
        availableDevices: 'Dispositivos disponibles',
        noDeviceFound: 'No se encontraron dispositivos',
      },
    },
  },
};

export default config;
