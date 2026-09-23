<?php
declare(strict_types=1);

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
