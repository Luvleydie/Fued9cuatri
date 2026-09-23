<?php
declare(strict_types=1);

function database(): PDO
{
    $config = require __DIR__ . '/config.php';
    return new PDO(
        "mysql:host={$config['host']};port={$config['port']};dbname={$config['database']};charset=utf8mb4",
        $config['user'], $config['password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
         PDO::ATTR_EMULATE_PREPARES => false]
    );
}

function query(PDO $db, string $sql, array $values = []): PDOStatement
{
    $statement = $db->prepare($sql);
    $statement->execute($values);
    return $statement;
}

const USER_FIELDS = 'id, username, email, first_name AS firstName, last_name AS lastName';

function findUser(PDO $db, int $id): array
{
    $user = query($db, 'SELECT ' . USER_FIELDS . ' FROM users WHERE id = ?', [$id])->fetch();
    if (!$user) throw new ApiException(404, 'Usuario no encontrado.');
    return $user;
}

function createUser(PDO $db, array $input): array
{
    query($db, 'INSERT INTO users (username, email, first_name, last_name, password_hash) VALUES (?, ?, ?, ?, ?)',
        [$input['username'], $input['email'], $input['firstName'], $input['lastName'],
         password_hash($input['password'], PASSWORD_ARGON2ID)]);
    return findUser($db, (int) $db->lastInsertId());
}
