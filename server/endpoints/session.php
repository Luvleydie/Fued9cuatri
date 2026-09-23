<?php
declare(strict_types=1);

// GET /api/auth/me -> datos públicos de la cuenta autenticada.
function currentUserEndpoint(PDO $db, int $userId): never
{
    requireMethod(['GET']);
    respond(findUser($db, $userId));
}

// POST /api/auth/logout -> 204. El token deja de funcionar en el servidor.
function logoutEndpoint(PDO $db, string $tokenHash): never
{
    requireMethod(['POST']);
    query($db, 'DELETE FROM sessions WHERE token_hash = ?', [$tokenHash]);
    respond(null, 204);
}
