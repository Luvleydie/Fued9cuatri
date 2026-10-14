export const EMULATOR_API_URL = 'http://10.0.2.2/novacart/api';

export function mobileApiUrl(value, allowLocalHttp = false) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Indica --api-url https://servidor/novacart/api o usa --emulator para XAMPP.');
  }
  let url;
  try { url = new URL(value); }
  catch { throw new Error('La API móvil necesita una URL absoluta.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.href.includes('?') || url.href.includes('#')) {
    throw new Error('La URL debe ser HTTP(S), sin credenciales, parámetros ni fragmentos.');
  }
  const hostname = url.hostname.replace(/\.+$/, '');
  const mappedLoopback = /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/i.test(hostname);
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '[::1]' || hostname === '[::]' || mappedLoopback || /^127\./.test(hostname) || hostname === '0.0.0.0') {
    throw new Error('localhost apunta al teléfono. Usa 10.0.2.2 en el emulador o la IP de tu PC en la misma red.');
  }
  const octets = url.hostname.split('.').map(Number);
  const ipv4 = octets.length === 4 && octets.every(n => Number.isInteger(n) && n >= 0 && n <= 255);
  const privateIp = ipv4 && (octets[0] === 10 || (octets[0] === 192 && octets[1] === 168) || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31));
  if (url.protocol === 'http:' && (!allowLocalHttp || !privateIp)) {
    throw new Error('Usa HTTPS. Para XAMPP en una IP privada puedes habilitar --allow-local-http en el APK debug.');
  }
  return url.href.replace(/\/+$/, '');
}

export function mobileBuildOptions(args, env = process.env) {
  let apiUrl = env.NOVACART_API_URL;
  let allowLocalHttp = false;
  let emulator = false;
  let apk = false;
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--emulator': emulator = true; break;
      case '--api-url':
        if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Falta el valor de --api-url.');
        apiUrl = args[++i];
        break;
      case '--allow-local-http': allowLocalHttp = true; break;
      case '--apk': apk = true; break;
      default: throw new Error('Opción desconocida: ' + args[i]);
    }
  }
  if (emulator && apiUrl) throw new Error('Usa --emulator o una URL propia, no ambos.');
  return { apiUrl: mobileApiUrl(emulator ? EMULATOR_API_URL : apiUrl, emulator || allowLocalHttp), apk };
}
