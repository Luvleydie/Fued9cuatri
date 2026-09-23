<?php
declare(strict_types=1);
// Herramientas MCP solo por CLI, con consultas fijas. No acepta SQL del modelo.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/database.php';
try {
    $db = database();
    $operation = $argv[1] ?? '';
    $value = match ($operation) {
        'schema' => query($db, 'SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName,
            COLUMN_TYPE AS columnType, COLUMN_KEY AS columnKey
            FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
            ORDER BY TABLE_NAME, ORDINAL_POSITION')->fetchAll(),
        'users' => query($db, 'SELECT ' . USER_FIELDS . ' FROM users ORDER BY id LIMIT 100')->fetchAll(),
        'products' => query($db, 'SELECT id, title, price, stock FROM products ORDER BY id LIMIT 100')->fetchAll(),
        'cart' => query($db, 'SELECT c.user_id AS userId, p.title, c.quantity, p.price
            FROM cart_items c JOIN products p ON p.id = c.product_id WHERE c.user_id = ? ORDER BY p.id LIMIT 100',
            [(int) ($argv[2] ?? 0)])->fetchAll(),
        default => throw new RuntimeException('Herramienta no permitida'),
    };
    echo json_encode($value, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
} catch (Throwable $error) {
    fwrite(STDERR, "No se pudo consultar novacart. Comprueba MySQL y server/config.php.\n");
    exit(1);
}
