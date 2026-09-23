import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
const client = new Client({ name: 'novacart-verification', version: '1.0.0' });
try {
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../mcp/server.mjs', import.meta.url))],
  }));
  const { tools } = await client.listTools();
  assert.equal(tools.length, 4);
  for (const tool of tools) assert.equal(tool.annotations.readOnlyHint, true);
  const schema = await client.callTool({ name: 'describe_schema', arguments: {} });
  assert.ok(!schema.isError);
  const columns = JSON.parse(schema.content[0].text);
  for (const name of ['users', 'sessions', 'products', 'cart_items']) assert.ok(columns.some(c => c.tableName === name));
  const users = await client.callTool({ name: 'list_users', arguments: {} });
  assert.ok(!users.isError);
  assert.ok(!/password_hash|token_hash/.test(users.content[0].text));
  const products = await client.callTool({ name: 'list_products', arguments: {} });
  assert.ok(!products.isError);
  assert.ok(JSON.parse(products.content[0].text).length >= 3);
  const cart = await client.callTool({ name: 'get_cart', arguments: { userId: 1 } });
  assert.ok(!cart.isError);
  const invalid = await client.callTool({ name: 'get_cart', arguments: { userId: -1 } });
  assert.equal(invalid.isError, true);
  console.log('PASS MCP: conexión stdio, 4 herramientas, esquema MySQL, datos públicos y validación.');
} finally { await client.close(); }
