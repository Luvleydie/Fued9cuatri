import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const children = new Set();
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
}

function start(script, args = [], env = process.env) {
  const child = spawn(process.execPath, [script, ...args], {
    cwd: root, stdio: 'inherit', windowsHide: true, env,
  });
  children.add(child);
  child.on('error', (error) => {
    console.error(`No se pudo iniciar NovaCart: ${error.message}`);
    stop(1);
  });
  child.on('exit', (code) => {
    children.delete(child);
    if (!stopping) stop(code ?? 1);
  });
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

// El proxy de Angular apunta al puerto 3001. Usar API separada para personalizarlo.
start('dist/server/server/index.js', [], { ...process.env, PORT: '3001' });
const frontendEnv = { ...process.env };
delete frontendEnv.PORT;
start('node_modules/@angular/cli/bin/ng.js', ['serve', '--host', 'localhost', '--port', '8100'], frontendEnv);
