<?php
declare(strict_types=1);
// Entrada única de la API: prepara la conexión, dirige la URL y maneja errores.
require __DIR__ . '/validation.php';
require __DIR__ . '/database.php';
require __DIR__ . '/http.php';
require __DIR__ . '/auth.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

try {
    $db = database();
    $route = '/' . trim($_GET['route'] ?? '', '/');

    if ($route === '/health') {
        requireMethod(['GET']);
        respond(['status' => 'ok', 'database' => 'mysql', 'name' => 'novacart']);
    }
    // Registro y login son públicos: todavía no existe un token.
    if ($route === '/auth/register') {
        require __DIR__ . '/endpoints/register.php';
        registerEndpoint($db);
    }
    if ($route === '/auth/login') {
        require __DIR__ . '/endpoints/login.php';
        loginEndpoint($db);
    }

    // Las rutas siguientes requieren un token válido antes de ejecutar su archivo.
    $session = authenticate($db);
    $userId = $session['userId'];

    if ($route === '/auth/me' || $route === '/auth/logout') {
        require __DIR__ . '/endpoints/session.php';
        if ($route === '/auth/me') currentUserEndpoint($db, $userId);
        logoutEndpoint($db, $session['hash']);
    }
    if ($route === '/users' || preg_match('#^/users/([^/]+)$#D', $route, $match)) {
        require __DIR__ . '/endpoints/users.php';
        $id = $route === '/users' ? null : positiveId($match[1]);
        usersEndpoint($db, $userId, $id);
    }
    if ($route === '/products') {
        require __DIR__ . '/endpoints/products.php';
        productsEndpoint($db);
    }
    if ($route === '/cart' || preg_match('#^/cart/([^/]+)$#D', $route, $match)) {
        require __DIR__ . '/endpoints/cart.php';
        $productId = $route === '/cart' ? null : positiveId($match[1]);
        cartEndpoint($db, $userId, $productId);
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
