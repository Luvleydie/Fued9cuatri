<?php
declare(strict_types=1);

// Solo acepta orígenes completos, sin rutas, credenciales ni comodines.
function corsOriginParts(string $origin): ?array
{
    if (preg_match('/[\x00-\x20\x7f]/', $origin)) return null;
    $parts = parse_url($origin);
    if ($parts === false || !isset($parts['scheme'], $parts['host'])) return null;
    if (array_diff(array_keys($parts), ['scheme', 'host', 'port'])) return null;
    $scheme = strtolower($parts['scheme']);
    if (!in_array($scheme, ['http', 'https', 'capacitor'], true)) return null;
    if (str_contains($parts['host'], '*')) return null;
    return [$scheme, strtolower($parts['host']), $parts['port'] ?? ($scheme === 'https' ? 443 : 80)];
}

function corsIsSameOrigin(string $origin): bool
{
    $scheme = !empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off' ? 'https' : 'http';
    // No se confía en X-Forwarded-* enviado por el cliente. Un proxy externo
    // debe agregar su origen público a cors_allowed_origins.
    $requestOrigin = $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? '');
    $originParts = corsOriginParts($origin);
    return $originParts !== null && $originParts === corsOriginParts($requestOrigin);
}

function applyCors(array $config): void
{
    header('Vary: Origin', false);
    $origin = $_SERVER['HTTP_ORIGIN'] ?? null;
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $allowedMethods = ['GET', 'POST', 'PUT', 'DELETE'];

    if ($origin !== null) {
        $allowedOrigins = $config['cors_allowed_origins'] ?? [];
        if (corsOriginParts($origin) === null ||
            (!corsIsSameOrigin($origin) && !in_array($origin, $allowedOrigins, true))) {
            throw new ApiException(403, 'El origen de esta aplicación no está autorizado. Revisa la configuración CORS de la API.');
        }
        header('Access-Control-Allow-Origin: ' . $origin);
        // La API usa Bearer Authorization; no habilita cookies entre orígenes.
    }

    if ($method !== 'OPTIONS') return;

    header('Allow: ' . implode(', ', [...$allowedMethods, 'OPTIONS']));
    header('Vary: Access-Control-Request-Method, Access-Control-Request-Headers', false);
    $requestedMethod = $_SERVER['HTTP_ACCESS_CONTROL_REQUEST_METHOD'] ?? null;
    if ($requestedMethod !== null && !in_array($requestedMethod, $allowedMethods, true)) {
        throw new ApiException(405, 'El método solicitado no está permitido por la API.');
    }
    $requestedHeaders = array_filter(array_map('trim', explode(',', strtolower($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS'] ?? ''))));
    if (array_diff($requestedHeaders, ['authorization', 'content-type'])) {
        throw new ApiException(400, 'La API solo permite las cabeceras Authorization y Content-Type en la solicitud CORS.');
    }
    if ($origin !== null) {
        header('Access-Control-Allow-Methods: ' . implode(', ', $allowedMethods));
        header('Access-Control-Allow-Headers: Authorization, Content-Type');
        header('Access-Control-Max-Age: 600');
    }
    respond(null, 204);
}
