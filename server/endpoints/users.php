<?php
declare(strict_types=1);

// /api/users y /api/users/:id. Práctica académica sin roles.
function usersEndpoint(PDO $db, int $currentUserId, ?int $id): never
{
    if ($id === null) {
        $method = requireMethod(['GET', 'POST']);
        if ($method === 'GET') {
            $users = query($db, 'SELECT ' . USER_FIELDS . ' FROM users ORDER BY id')->fetchAll();
            respond(['users' => $users]);
        }
        respond(createUser($db, userInput(body(), true)), 201);
    }

    $method = requireMethod(['GET', 'PUT', 'DELETE']);
    if ($method === 'GET') respond(findUser($db, $id));
    if ($method === 'DELETE') {
        if ($id === $currentUserId) throw new ApiException(409, 'No puedes eliminar tu propia cuenta.');
        $deleted = query($db, 'DELETE FROM users WHERE id = ?', [$id])->rowCount();
        if (!$deleted) throw new ApiException(404, 'Usuario no encontrado.');
        respond(null, 204);
    }

    $input = userInput(body(), false);
    // La transacción mantiene juntos los cambios de perfil, contraseña y sesiones.
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
