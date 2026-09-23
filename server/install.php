<?php
declare(strict_types=1);
// Solo CLI: no permite inicializar la base desde una URL.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/database.php';
try {
    $db = database();
    $db->exec(file_get_contents(__DIR__ . '/schema.sql'));
    if (!query($db, 'SELECT id FROM users WHERE username = ?', ['emilys'])->fetch()) {
        query($db, 'INSERT INTO users (username, email, first_name, last_name, password_hash) VALUES (?, ?, ?, ?, ?)',
            ['emilys', 'emily@example.test', 'Emily', 'Johnson', password_hash('emilyspass', PASSWORD_ARGON2ID)]);
    }
    foreach ([[1, 'Mouse inalámbrico', 249.00, 20], [2, 'Teclado compacto', 599.00, 15], [3, 'Audífonos', 399.00, 25]] as $product) {
        if (!query($db, 'SELECT id FROM products WHERE id = ?', [$product[0]])->fetch()) {
            query($db, 'INSERT INTO products (id, title, price, stock) VALUES (?, ?, ?, ?)', $product);
        }
    }
    echo "Base novacart preparada: users, sessions, products y cart_items.\n";
} catch (Throwable $error) {
    fwrite(STDERR, "No se pudo preparar MySQL. Comprueba Apache/MySQL y server/config.php.\n");
    exit(1);
}
