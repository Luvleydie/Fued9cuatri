<?php
declare(strict_types=1);

class ApiException extends RuntimeException
{
    public function __construct(public int $status, string $message, public array $errors = [])
    {
        parent::__construct($message);
    }
}

function body(): array
{
    if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) {
        throw new ApiException(415, 'Envía los datos como JSON.');
    }
    $raw = file_get_contents('php://input', false, null, 0, 65537);
    if (strlen($raw) > 65536) throw new ApiException(413, 'El formulario es demasiado grande.');
    try { $value = json_decode($raw, false, 32, JSON_THROW_ON_ERROR); }
    catch (JsonException $error) { throw new ApiException(400, 'JSON no válido.'); }
    if (!$value instanceof stdClass) throw new ApiException(400, 'Se esperaba un objeto JSON.');
    return (array) $value;
}

function userInput(array $value, bool $creating): array
{
    $result = [];
    $errors = [];
    foreach (['username' => 100, 'firstName' => 100, 'lastName' => 100, 'email' => 254] as $field => $max) {
        $text = is_string($value[$field] ?? null) ? trim($value[$field]) : '';
        if ($text === '' || mb_strlen($text) > $max || preg_match('/[\x00-\x1f\x7f]/', $text)) {
            $errors[$field] = "Completa $field (máximo $max caracteres).";
        }
        $result[$field] = $text;
    }
    if (!preg_match('/^[a-zA-Z0-9_.-]{3,100}$/D', $result['username'])) {
        $errors['username'] = 'Usuario: de 3 a 100 letras, números, puntos o guiones.';
    }
    if (!filter_var($result['email'], FILTER_VALIDATE_EMAIL)) $errors['email'] = 'Correo no válido.';
    $password = $value['password'] ?? '';
    if ($creating || $password !== '') {
        if (!is_string($password) || mb_strlen($password) < 8 || mb_strlen($password) > 200 ||
            trim($password) === '' || preg_match('/[\x00-\x1f\x7f]/', $password)) {
            $errors['password'] = 'La contraseña debe tener de 8 a 200 caracteres.';
        } else $result['password'] = $password;
    }
    if ($errors) throw new ApiException(400, implode(' ', $errors), $errors);
    return $result;
}

function positiveId(string $value): int
{
    if (!ctype_digit($value) || (int) $value < 1 || (int) $value > 4294967295) {
        throw new ApiException(400, 'Identificador no válido.');
    }
    return (int) $value;
}
