<?php
declare(strict_types=1);
require __DIR__ . '/validation.php';
require __DIR__ . '/database.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function respond(mixed $data = null, int $status = 200): never
{
    http_response_code($status);
    if ($data !== null) echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}

function requireMethod(array $allowed): string
{
    $method = $_SERVER['REQUEST_METHOD'];
    if (!in_array($method, $allowed, true)) {
        header('Allow: ' . implode(', ', $allowed));
        throw new ApiException(405, 'Método no permitido.');
    }
    return $method;
}

function authenticate(PDO $db): array
{
    $authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer ([a-f0-9]{64})$/D', $authorization, $match)) {
        throw new ApiException(401, 'Inicia sesión para continuar.');
    }
    $hash = hash('sha256', $match[1]);
    $session = query($db, 'SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?', [$hash, time()])->fetch();
    if (!$session) throw new ApiException(401, 'Tu sesión terminó. Inicia sesión de nuevo.');
    return ['userId' => (int) $session['user_id'], 'hash' => $hash];
}

function createUser(PDO $db, array $input): array
{
    query($db, 'INSERT INTO users (username, email, first_name, last_name, password_hash) VALUES (?, ?, ?, ?, ?)',
        [$input['username'], $input['email'], $input['firstName'], $input['lastName'],
         password_hash($input['password'], PASSWORD_ARGON2ID)]);
    return findUser($db, (int) $db->lastInsertId());
}

function cart(PDO $db, int $userId): array
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

try {
    $db = database();
    $route = '/' . trim($_GET['route'] ?? '', '/');
    if ($route === '/health') {
        requireMethod(['GET']);
        respond(['status' => 'ok', 'database' => 'mysql', 'name' => 'novacart']);
    }
    if ($route === '/auth/register') {
        requireMethod(['POST']);
        respond(createUser($db, userInput(body(), true)), 201);
    }
    if ($route === '/auth/login') {
        requireMethod(['POST']);
        $input = body();
        if (!is_string($input['username'] ?? null) || !is_string($input['password'] ?? null) ||
            strlen($input['username']) > 100 || strlen($input['password']) > 800) {
            throw new ApiException(400, 'Escribe tu usuario y contraseña.');
        }
        $user = query($db, 'SELECT id, password_hash FROM users WHERE username = ?', [trim($input['username'])])->fetch();
        if (!$user || !password_verify($input['password'], $user['password_hash'])) {
            throw new ApiException(401, 'Usuario o contraseña incorrectos.');
        }
        $token = bin2hex(random_bytes(32));
        $expires = time() + 3600;
        query($db, 'DELETE FROM sessions WHERE expires_at <= ?', [time()]);
        query($db, 'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
            [hash('sha256', $token), $user['id'], $expires]);
        respond([...findUser($db, (int) $user['id']), 'accessToken' => $token, 'expiresAt' => $expires]);
    }

    $session = authenticate($db);
    $userId = $session['userId'];
    if ($route === '/auth/me') {
        requireMethod(['GET']);
        respond(findUser($db, $userId));
    }
    if ($route === '/auth/logout') {
        requireMethod(['POST']);
        query($db, 'DELETE FROM sessions WHERE token_hash = ?', [$session['hash']]);
        respond(null, 204);
    }
    // Práctica académica: cualquier usuario autenticado administra usuarios.
    if ($route === '/users') {
        $method = requireMethod(['GET', 'POST']);
        if ($method === 'GET') respond(['users' => query($db, 'SELECT ' . USER_FIELDS . ' FROM users ORDER BY id')->fetchAll()]);
        respond(createUser($db, userInput(body(), true)), 201);
    }
    if (preg_match('#^/users/([^/]+)$#D', $route, $match)) {
        $method = requireMethod(['GET', 'PUT', 'DELETE']);
        $id = positiveId($match[1]);
        if ($method === 'GET') respond(findUser($db, $id));
        if ($method === 'DELETE') {
            if ($id === $userId) throw new ApiException(409, 'No puedes eliminar tu propia cuenta.');
            $deleted = query($db, 'DELETE FROM users WHERE id = ?', [$id])->rowCount();
            if (!$deleted) throw new ApiException(404, 'Usuario no encontrado.');
            respond(null, 204);
        }
        $input = userInput(body(), false);
        $db->beginTransaction();
        if (!query($db, 'SELECT id FROM users WHERE id = ? FOR UPDATE', [$id])->fetch()) {
            throw new ApiException(404, 'Usuario no encontrado.');
        }
        query($db, 'UPDATE users SET username = ?, email = ?, first_name = ?, last_name = ? WHERE id = ?',
            [$input['username'], $input['email'], $input['firstName'], $input['lastName'], $id]);
        if (isset($input['password'])) {
            query($db, 'UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($input['password'], PASSWORD_ARGON2ID), $id]);
            query($db, 'DELETE FROM sessions WHERE user_id = ?', [$id]);
        }
        $user = findUser($db, $id);
        $db->commit();
        respond($user);
    }
    if ($route === '/products') {
        requireMethod(['GET']);
        $products = query($db, 'SELECT id, title, price, stock FROM products ORDER BY id')->fetchAll();
        foreach ($products as &$product) $product['price'] = (float) $product['price'];
        respond(['products' => $products]);
    }
    if ($route === '/cart') {
        requireMethod(['GET']);
        respond(cart($db, $userId));
    }
    if (preg_match('#^/cart/([^/]+)$#D', $route, $match)) {
        $method = requireMethod(['PUT', 'DELETE']);
        $productId = positiveId($match[1]);
        if ($method === 'DELETE') {
            query($db, 'DELETE FROM cart_items WHERE user_id = ? AND product_id = ?', [$userId, $productId]);
            respond(cart($db, $userId));
        }
        $quantity = body()['quantity'] ?? null;
        $product = query($db, 'SELECT stock FROM products WHERE id = ?', [$productId])->fetch();
        if (!$product) throw new ApiException(404, 'Producto no encontrado.');
        if (!is_int($quantity) || $quantity < 1 || $quantity > min(99, $product['stock'])) {
            throw new ApiException(400, 'Cantidad no válida o superior al stock disponible.');
        }
        query($db, 'INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)', [$userId, $productId, $quantity]);
        respond(cart($db, $userId));
    }
    throw new ApiException(404, 'Ruta no encontrada.');
} catch (ApiException $error) {
    if (isset($db) && $db->inTransaction()) $db->rollBack();
    respond(['message' => $error->getMessage(), 'errors' => (object) $error->errors], $error->status);
} catch (PDOException $error) {
    if (isset($db) && $db->inTransaction()) $db->rollBack();
    if (($error->errorInfo[1] ?? null) === 1062) respond(['message' => 'Ese nombre de usuario ya está registrado.'], 409);
    error_log('NovaCart: error de base de datos, código ' . $error->getCode());
    respond(['message' => 'No se pudo consultar MySQL. Revisa XAMPP y la configuración de la base.'], 503);
} catch (Throwable $error) {
    if (isset($db) && $db->inTransaction()) $db->rollBack();
    error_log('NovaCart: error interno ' . get_class($error));
    respond(['message' => 'No se pudo completar la operación.'], 500);
}
