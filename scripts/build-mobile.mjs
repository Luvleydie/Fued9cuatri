import { spawnSync } from 'node:child_process';
import { access, copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mobileBuildOptions } from './mobile-config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

function run(command, args, cwd = root, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Falló ' + path.basename(command) + ' (código ' + result.status + ').');
}

function androidEnvironment() {
  const env = { ...process.env };
  // Android Studio incluye Java 21. NOVACART_JAVA_HOME permite elegir otro JDK
  // sin modificar JAVA_HOME global ni la configuración de otros proyectos.
  const studioJava = process.platform === 'win32' ? 'C:/Program Files/Android/Android Studio/jbr' : '';
  const javaHome = env.NOVACART_JAVA_HOME || (studioJava && existsSync(studioJava) ? studioJava : env.JAVA_HOME);
  if (javaHome) env.JAVA_HOME = javaHome;
  const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT || (env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'Android/Sdk') : '');
  if (sdk) env.ANDROID_HOME = sdk;
  if (!sdk || !existsSync(sdk)) throw new Error('No se encontró Android SDK. Define ANDROID_HOME antes de generar el APK.');
  return env;
}

try {
  const options = mobileBuildOptions(process.argv.slice(2));
  const env = options.apk ? androidEnvironment() : process.env;
  console.log('API móvil: ' + options.apiUrl);
  run(process.execPath, [
    'node_modules/@angular/cli/bin/ng.js', 'build', '--configuration=production,mobile',
    '--define', 'NOVACART_API_URL=' + JSON.stringify(options.apiUrl),
  ]);
  await access(path.join(root, 'www-mobile/index.html'));
  run(process.execPath, ['node_modules/@capacitor/cli/bin/capacitor', 'sync', 'android']);
  if (options.apk) {
    const android = path.join(root, 'android');
    if (process.platform === 'win32') run('cmd.exe', ['/d', '/c', 'gradlew.bat', 'assembleDebug', '--console=plain'], android, env);
    else run('./gradlew', ['assembleDebug', '--console=plain'], android, env);
    const output = path.join(root, 'output/android');
    await mkdir(output, { recursive: true });
    const apk = path.join(output, 'NovaCart-debug.apk');
    await copyFile(path.join(android, 'app/build/outputs/apk/debug/app-debug.apk'), apk);
    console.log('APK debug: ' + apk);
  } else console.log('Android sincronizado. Añade --apk para generar el instalador debug.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
