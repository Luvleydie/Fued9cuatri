<?php
declare(strict_types=1);

// Consulta cantidades del usuario y precios reales de products; calcula el total.
function readCart(PDO $db, int $userId): array
{
    $items = query($db, 'SELECT p.id AS productId, p.title, p.price, p.stock, c.quantity
        FROM cart_items c JOIN products p ON p.id = c.product_id WHERE c.user_id = ? ORDER BY p.id', [$userId])->fetchAll();
    $totalCents = 0;
    foreach ($items as &$item) {
        $item['price'] = (float) $item['price'];
        $totalCents += (int) round($item['price'] * 100) * $item['quantity'];
    }
    return ['items' => $items, 'total' => $totalCents / 100];
}

// GET /api/cart; PUT o DELETE /api/cart/:productId -> CartResponse.
function cartEndpoint(PDO $db, int $userId, ?int $productId): never
{
    if ($productId === null) {
        requireMethod(['GET']);
        respond(readCart($db, $userId));
    }

    $method = requireMethod(['PUT', 'DELETE']);
    if ($method === 'DELETE') {
        query($db, 'DELETE FROM cart_items WHERE user_id = ? AND product_id = ?', [$userId, $productId]);
        respond(readCart($db, $userId));
    }

    $quantity = body()['quantity'] ?? null;
    $product = query($db, 'SELECT stock FROM products WHERE id = ?', [$productId])->fetch();
    if (!$product) throw new ApiException(404, 'Producto no encontrado.');
    if (!is_int($quantity) || $quantity < 1 || $quantity > min(99, $product['stock'])) {
        throw new ApiException(400, 'Cantidad no válida o superior al stock disponible.');
    }
    // PUT asigna la cantidad exacta; si no existe el artículo, lo agrega.
    query($db, 'INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)', [$userId, $productId, $quantity]);
    respond(readCart($db, $userId));
}
