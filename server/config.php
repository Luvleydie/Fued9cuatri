<?php
declare(strict_types=1);

// Valores locales de XAMPP. config.local.php (excluido de Git) puede cambiarlos.
$local = is_file(__DIR__ . '/config.local.php') ? require __DIR__ . '/config.local.php' : [];
$corsOrigins = getenv('CORS_ALLOWED_ORIGINS');
return array_replace([
    'host' => getenv('DB_HOST') ?: '127.0.0.1',
    'port' => getenv('DB_PORT') ?: '3306',
    'database' => getenv('DB_NAME') ?: 'novacart',
    'user' => getenv('DB_USER') ?: 'root',
    'password' => getenv('DB_PASSWORD') ?: '',
    // Orígenes exactos separados por comas. La web del mismo origen también se permite.
    // localhost:8100 (npm run dev) y :4200 (npm start) usan el proxy de Angular.
    'cors_allowed_origins' => $corsOrigins === false
        ? ['https://localhost', 'capacitor://localhost', 'http://localhost:8100', 'http://localhost:4200']
        : array_values(array_filter(array_map('trim', explode(',', $corsOrigins)))),
], $local);