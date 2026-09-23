import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const inspector = fileURLToPath(new URL('../server/inspect.php', import.meta.url));
const php = process.env.PHP_BIN || 'C:/xampp/php/php.exe';
const server = new McpServer({ name: 'novacart-mysql', version: '1.0.0' });

async function inspect(operation, userId) {
  try {
    const args = [inspector, operation, ...(userId ? [String(userId)] : [])];
    const { stdout } = await run(php, args, { windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024 });
    return { content: [{ type: 'text', text: JSON.stringify(JSON.parse(stdout), null, 2) }] };
  } catch {
    return { isError: true, content: [{ type: 'text', text: 'MySQL no está disponible. Revisa XAMPP y server/config.php.' }] };
  }
}

const annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
server.registerTool('describe_schema', { description: 'Describe las tablas y columnas de novacart en MySQL.', annotations },
  () => inspect('schema'));
server.registerTool('list_users', { description: 'Consulta hasta 100 usuarios de novacart; no devuelve contraseñas ni tokens.', annotations },
  () => inspect('users'));
server.registerTool('list_products', { description: 'Consulta hasta 100 productos y precios del carrito.', annotations },
  () => inspect('products'));
server.registerTool('get_cart', { description: 'Consulta el carrito de un usuario por ID.',
  inputSchema: { userId: z.number().int().positive().max(4294967295) }, annotations },
  ({ userId }) => inspect('cart', userId));

// stdout queda reservado para los mensajes del protocolo MCP.
await server.connect(new StdioServerTransport());
