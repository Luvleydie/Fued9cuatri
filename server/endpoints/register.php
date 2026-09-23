<?php
declare(strict_types=1);

// POST /api/auth/register -> 201 y User. Registrar no inicia sesión.
function registerEndpoint(PDO $db): never
{
    requireMethod(['POST']);
    $input = userInput(body(), true);
    // createUser calcula el hash de la contraseña y ejecuta INSERT en users.
    $user = createUser($db, $input);
    respond($user, 201);
}
