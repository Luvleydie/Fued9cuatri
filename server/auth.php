<?php
declare(strict_types=1);

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
