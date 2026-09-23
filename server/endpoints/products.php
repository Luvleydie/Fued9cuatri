<?php
declare(strict_types=1);

// GET /api/products -> catálogo pequeño utilizado por la pantalla del carrito.
function productsEndpoint(PDO $db): never
{
    requireMethod(['GET']);
    $products = query($db, 'SELECT id, title, price, stock FROM products ORDER BY id')->fetchAll();
    foreach ($products as &$product) $product['price'] = (float) $product['price'];
    respond(['products' => $products]);
}
