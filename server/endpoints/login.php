<?php
declare(strict_types=1);

// POST /api/auth/login -> AuthResponse: usuario público + token + vencimiento.
function loginEndpoint(PDO $db): never
{
    requireMethod(['POST']);
    $input = body();
    if (!is_string($input['username'] ?? null) || !is_string($input['password'] ?? null) ||
        strlen($input['username']) > 100 || strlen($input['password']) > 800) {
        throw new ApiException(400, 'Escribe tu usuario y contraseña.');
    }

    // El ? se sustituye mediante PDO; no se concatena el username en el SQL.
    $user = query($db, 'SELECT id, password_hash FROM users WHERE username = ?', [trim($input['username'])])->fetch();
    if (!$user || !password_verify($input['password'], $user['password_hash'])) {
        throw new ApiException(401, 'Usuario o contraseña incorrectos.');
    }

    $token = bin2hex(random_bytes(32));
    $expires = time() + 3600;
    query($db, 'DELETE FROM sessions WHERE expires_at <= ?', [time()]);
    query($db, 'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
        [hash('sha256', $token), $user['id'], $expires]);
    // El navegador recibe el token; MySQL conserva únicamente su hash.
    respond([...findUser($db, (int) $user['id']), 'accessToken' => $token, 'expiresAt' => $expires]);
}
