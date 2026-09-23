import { cp, mkdir, copyFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const xampp = process.env.XAMPP_PATH || 'C:/xampp';
const php = process.env.PHP_BIN || path.join(xampp, 'php/php.exe');
const target = path.join(xampp, 'htdocs/novacart');
const mode = process.argv[2] || 'api';
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error('No se pudo ejecutar: ' + command);
};
await access(php);
if (mode === 'db') {
  run(php, ['server/install.php']);
} else {
  await mkdir(path.join(target, 'api'), { recursive: true });
  for (const name of ['index.php', 'config.php', 'database.php', 'validation.php', '.htaccess']) {
    await copyFile(path.join(root, 'server', name), path.join(target, 'api', name));
  }
  try { await copyFile(path.join(root, 'server/config.local.php'), path.join(target, 'api/config.local.php')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (mode === 'deploy') {
    run(process.execPath, ['node_modules/@angular/cli/bin/ng.js', 'build', '--base-href=/novacart/']);
    await cp(path.join(root, 'www'), target, { recursive: true });
    await copyFile(path.join(root, 'scripts/apache.htaccess'), path.join(target, '.htaccess'));
    console.log('App: http://localhost/novacart/');
  } else console.log('API PHP: http://localhost/novacart/api/health');
}
