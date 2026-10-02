import { describe, expect, it, vi } from 'vitest';
import {
  applyServerErrors, bindFormChanges, createLoginForm, createUserForm, getFieldError,
  LOGIN_FIELD_DEFINITIONS, setUserFormMode, USER_FIELD_DEFINITIONS, userInputFromForm,
} from './form-models';

const validUser = {
  username: 'ana.lopez', firstName: 'Ana', lastName: 'López', email: 'ana@example.com',
  password: 'clave123', confirmPassword: 'clave123',
};
const httpError = (status: number, errors: unknown) => ({ isAxiosError: true, response: { status, data: { errors } } });

describe('Modelo Data Driven de usuarios', () => {
  it('crea controles tipados no nulos, inválidos inicialmente y con reset predecible', () => {
    const form = createUserForm();
    expect(form.invalid).toBe(true);
    expect(Object.keys(form.controls)).toEqual(USER_FIELD_DEFINITIONS.map(field => field.key));
    form.setValue(validUser);
    expect(form.valid).toBe(true);
    form.reset();
    expect(Object.values(form.getRawValue())).toEqual(['', '', '', '', '', '']);
    expect(form.pristine).toBe(true);
    expect(form.untouched).toBe(true);
  });

  it.each(['ab', 'con espacios', 'niño', 'x@y', 'a'.repeat(101)])('rechaza el usuario inválido %s', value => {
    const form = createUserForm();
    form.setValue({ ...validUser, username: value });
    expect(form.controls.username.invalid).toBe(true);
  });

  it.each(['abc', 'A_2.x-y', 'a'.repeat(100), '  ana.lopez  '])('acepta el usuario válido %s', value => {
    const form = createUserForm();
    form.setValue({ ...validUser, username: value });
    expect(form.valid).toBe(true);
  });

  it.each(['', '   ', 'Ana\u0000María', 'Ana\nMaría', 'x'.repeat(101)])('rechaza un nombre vacío, con controles o demasiado largo: %j', value => {
    const form = createUserForm();
    form.setValue({ ...validUser, firstName: value });
    expect(form.controls.firstName.invalid).toBe(true);
  });

  it('cuenta Unicode igual que PHP y admite nombres internacionales', () => {
    const form = createUserForm();
    form.setValue({ ...validUser, firstName: '😀'.repeat(100), lastName: ' Muñoz 李 ' });
    expect(form.valid).toBe(true);
    form.controls.firstName.setValue('😀'.repeat(101));
    expect(form.controls.firstName.hasError('maxlength')).toBe(true);
  });

  it.each(['ana', 'ana@', '@example.com', 'a@localhost', 'a b@example.com', 'a..b@example.com'])('rechaza el correo inválido %s', email => {
    const form = createUserForm();
    form.setValue({ ...validUser, email });
    expect(form.controls.email.hasError('email')).toBe(true);
  });

  it.each([' ana@example.com ', 'ana+ventas@example.com', 'ana@sub.example.com'])('normaliza correo válido %s antes de validar y enviar', email => {
    const form = createUserForm();
    form.setValue({ ...validUser, email });
    expect(form.valid).toBe(true);
    expect(userInputFromForm(form).email).toBe(email.trim());
  });

  it.each(['', '1234567', ' '.repeat(8), 'clave\n123', 'clave\u007f123', 'x'.repeat(201)])('rechaza contraseña inválida %j en alta', password => {
    const form = createUserForm();
    form.setValue({ ...validUser, password, confirmPassword: password });
    expect(form.controls.password.invalid).toBe(true);
  });

  it.each(['12345678', 'x'.repeat(200), '😀'.repeat(8), '  clave  '])('acepta contraseña de 8 a 200 caracteres y conserva espacios: %j', password => {
    const form = createUserForm();
    form.setValue({ ...validUser, password, confirmPassword: password });
    expect(form.valid).toBe(true);
    expect(userInputFromForm(form).password).toBe(password);
  });

  it('exige confirmación y detecta diferencias sin alterar el error propio de un control', () => {
    const form = createUserForm();
    form.setValue({ ...validUser, confirmPassword: '' });
    expect(form.hasError('passwordConfirmationRequired')).toBe(true);
    expect(getFieldError(form, 'confirmPassword', true)).toBe('Confirma tu contraseña.');
    form.controls.confirmPassword.setValue('clave123 ');
    expect(form.hasError('passwordMismatch')).toBe(true);
    expect(getFieldError(form, 'confirmPassword', true)).toBe('Las contraseñas no coinciden.');
    form.controls.confirmPassword.setValue('clave123');
    expect(form.valid).toBe(true);
    expect(getFieldError(form, 'confirmPassword', true)).toBe('');
  });

  it('la edición conserva contraseña vacía y exige confirmar solo si se cambia', () => {
    const form = createUserForm('edit');
    form.setValue({ ...validUser, password: '', confirmPassword: '' });
    expect(form.valid).toBe(true);
    expect(userInputFromForm(form)).not.toHaveProperty('password');
    form.controls.password.setValue('otra1234');
    expect(form.invalid).toBe(true);
    expect(getFieldError(form, 'confirmPassword', true)).toBe('Confirma tu contraseña.');
    form.controls.confirmPassword.setValue('otra1234');
    expect(form.valid).toBe(true);
    form.controls.password.setValue('');
    expect(form.hasError('passwordMismatch')).toBe(true);
  });

  it('cambia las reglas al alternar alta y edición sin perder los datos', () => {
    const form = createUserForm();
    form.setValue({ ...validUser, password: '', confirmPassword: '' });
    expect(form.invalid).toBe(true);
    setUserFormMode(form, 'edit');
    expect(form.valid).toBe(true);
    setUserFormMode(form, 'create');
    expect(form.controls.password.hasError('required')).toBe(true);
    expect(form.controls.confirmPassword.hasError('required')).toBe(true);
    expect(form.controls.username.value).toBe(validUser.username);
  });

  it('construye un payload explícito, normalizado y sin confirmación incluso estando deshabilitado', () => {
    const form = createUserForm();
    form.setValue({ ...validUser, username: ' ana.lopez ', firstName: ' Ana ', lastName: ' López ', email: ' ana@example.com ' });
    form.disable();
    expect(userInputFromForm(form)).toEqual({ username: 'ana.lopez', firstName: 'Ana', lastName: 'López', email: 'ana@example.com', password: 'clave123' });
    expect(userInputFromForm(form)).not.toHaveProperty('confirmPassword');
  });

  it('muestra errores de campo al tocar, editar o intentar enviar y los oculta al reset', () => {
    const form = createUserForm();
    expect(getFieldError(form, 'username')).toBe('');
    form.controls.username.markAsTouched();
    expect(getFieldError(form, 'username')).toContain('Completa');
    form.controls.email.markAsDirty();
    expect(getFieldError(form, 'email')).toContain('Completa');
    expect(getFieldError(form, 'lastName', true)).toContain('Completa');
    expect(getFieldError(form, 'constructor', true)).toBe('');
    expect(getFieldError(form, 'noExiste', true)).toBe('');
    form.reset();
    expect(getFieldError(form, 'username')).toBe('');
    form.disable();
    expect(getFieldError(form, 'username', true)).toBe('');
  });
});

describe('Modelo Data Driven de acceso', () => {
  it('admite credenciales existentes sin aplicar las reglas del alta', () => {
    const form = createLoginForm();
    expect(Object.keys(form.controls)).toEqual(LOGIN_FIELD_DEFINITIONS.map(field => field.key));
    form.setValue({ username: ' emilys ', password: '123' });
    expect(form.valid).toBe(true);
    form.reset();
    expect(form.getRawValue()).toEqual({ username: '', password: '' });
    expect(form.invalid).toBe(true);
  });

  it.each([
    { username: '   ', password: 'clave123' },
    { username: 'a'.repeat(101), password: 'clave123' },
    { username: 'ana', password: '' },
    { username: 'ana', password: 'x'.repeat(201) },
  ])('valida solo presencia y límites en acceso: %j', value => {
    const form = createLoginForm();
    form.setValue(value);
    expect(form.invalid).toBe(true);
  });
});

describe('Errores por campo y actualización de Reactive Forms', () => {
  it.each([400, 422])('mapea validación HTTP %s únicamente a campos conocidos', status => {
    const form = createUserForm();
    form.setValue(validUser);
    const errors = JSON.parse('{"username":"El usuario ya existe.","__proto__":"No permitido","constructor":"No permitido","email.interno":"No permitido"}');
    expect(applyServerErrors(form, httpError(status, errors))).toBe(true);
    expect(getFieldError(form, 'username')).toBe('El usuario ya existe.');
    expect(form.controls.username.touched).toBe(true);
    expect(form.invalid).toBe(true);
    expect(Object.keys(form.controls)).toHaveLength(6);
  });

  it.each([401, 403, 409, 500, 503])('no transforma HTTP %s en validación local', status => {
    const form = createUserForm();
    form.setValue(validUser);
    expect(applyServerErrors(form, httpError(status, { username: 'Error' }))).toBe(false);
    expect(form.valid).toBe(true);
  });

  it.each([undefined, null, [], 'error', { noExiste: 'error' }, { username: { message: 'error' } }])('ignora errores malformados o desconocidos: %j', errors => {
    const form = createUserForm();
    form.setValue(validUser);
    expect(applyServerErrors(form, httpError(400, errors))).toBe(false);
    expect(form.valid).toBe(true);
  });

  it.each(['SQLSTATE[HY000]: secreto', '<script>alert(1)</script>', 'PDOException: clave', 'Fatal error in /var/www/api.php', 'x'.repeat(251)])('no expone información interna: %s', message => {
    const form = createUserForm();
    form.setValue(validUser);
    expect(applyServerErrors(form, httpError(422, { username: message }))).toBe(true);
    expect(getFieldError(form, 'username')).toBe('Revisa el campo usuario.');
  });

  it('permite corregir errores servidor sin borrar errores de otros campos', () => {
    const form = createUserForm();
    form.setValue(validUser);
    const refresh = vi.fn();
    const subscription = bindFormChanges(form, refresh);
    applyServerErrors(form, httpError(400, { username: 'Usuario ocupado.', email: 'Correo ocupado.' }));
    form.controls.username.setValue('ana.nueva');
    expect(form.controls.username.hasError('server')).toBe(false);
    expect(form.controls.email.hasError('server')).toBe(true);
    expect(form.invalid).toBe(true);
    form.controls.email.setValue('ana.nueva@example.com');
    expect(form.valid).toBe(true);
    expect(refresh).toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('actualiza al tocar y cambiar estado, y permite desuscribirse al destruir la página', () => {
    const form = createUserForm();
    const refresh = vi.fn();
    const subscription = bindFormChanges(form, refresh);
    form.controls.username.markAsTouched();
    expect(refresh).toHaveBeenCalled();
    refresh.mockClear();
    form.setValue(validUser);
    expect(refresh).toHaveBeenCalled();
    subscription.unsubscribe();
    refresh.mockClear();
    form.controls.username.setValue('otro.usuario');
    expect(refresh).not.toHaveBeenCalled();
    expect(subscription.closed).toBe(true);
  });
});
