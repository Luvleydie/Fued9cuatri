import { CartResponse } from '../models/cart-item.model';
import { CachedResult } from './api/data-cache';

export interface ShoppingListFile {
  filename: string;
  contents: string;
}

interface ShoppingListOptions {
  generatedAt?: Date;
  offline?: boolean;
  needsRefresh?: boolean;
}

function money(amount: number): string {
  return `${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount)} MXN`;
}

function dateLabel(date: Date): string {
  return `${date.toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'medium', timeStyle: 'short' })} (Ciudad de México)`;
}

/** Usa únicamente la última selección guardada: los borradores del formulario no son compras. */
export function createShoppingList(snapshot: CachedResult<CartResponse>, options: ShoppingListOptions = {}): ShoppingListFile {
  const generatedAt = options.generatedAt ?? new Date();
  const { items, total } = snapshot.data;
  const lines = [
    'NOVACART · LISTA DE COMPRA',
    'El tianguis digital · Tu selección para llevar',
    '',
    `Lista creada: ${dateLabel(generatedAt)}`,
    `Datos guardados: ${dateLabel(new Date(snapshot.savedAt))}`,
    snapshot.source === 'cache'
      ? 'Origen: copia temporal local del carrito.'
      : 'Origen: última respuesta guardada de la API.',
  ];
  if (snapshot.source === 'cache' || options.offline || options.needsRefresh) {
    lines.push('Los datos pueden estar desactualizados. Actualiza con conexión para verificar precios y cantidades.');
  }
  if (options.needsRefresh) lines.push('Hay cambios cuya confirmación está pendiente; esta lista conserva la selección anterior.');
  lines.push('', 'PRODUCTOS', '----------------------------------------');

  items.forEach((item, index) => {
    // Mantiene cada nombre en una línea incluso si la API contiene saltos de línea.
    const title = item.title.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim();
    const subtotal = Math.round(item.price * 100) * item.quantity / 100;
    lines.push(
      `${index + 1}. ${title}`,
      `   Cantidad: ${item.quantity} | Precio unitario: ${money(item.price)}`,
      `   Subtotal: ${money(subtotal)}`,
      '',
    );
  });
  lines.push(
    '----------------------------------------',
    `Productos diferentes: ${items.length}`,
    `Unidades guardadas: ${items.reduce((sum, item) => sum + item.quantity, 0)}`,
    `Total guardado: ${money(total)}`,
    '',
    'Incluye solo cantidades guardadas; los cambios sin guardar no aparecen.',
    'Es una lista de compra. No confirma una compra, un pago ni una reserva de existencias.',
  );
  return {
    filename: `novacart-lista-${generatedAt.toISOString().slice(0, 10)}.txt`,
    // BOM y CRLF permiten abrir correctamente los acentos también en editores de Windows.
    contents: '\uFEFF' + lines.join('\r\n') + '\r\n',
  };
}
