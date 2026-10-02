import {
  AbstractControl, FormBuilder, FormGroup, ValidationErrors, ValidatorFn,
  Validators, ValueChangeEvent,
} from '@angular/forms';
import axios from 'axios';
import { Subscription } from 'rxjs';
import { UserInput } from '../../models/user-input.model';

export type UserFormMode = 'create' | 'edit';
export type UserField = 'username' | 'firstName' | 'lastName' | 'email' | 'password' | 'confirmPassword';

export interface FormFieldDefinition {
  readonly key: UserField;
  readonly label: string;
  readonly type: 'text' | 'email' | 'password';
  readonly autocomplete: string;
  readonly maxLength: number;
  readonly placeholder: string;
  readonly hint: string;
}

/** Los controles, las reglas y su presentación se definen desde el modelo. */
export const USER_FIELD_DEFINITIONS: readonly FormFieldDefinition[] = [
  { key: 'username', label: 'Usuario', type: 'text', autocomplete: 'username', maxLength: 100, placeholder: 'Tu usuario', hint: 'De 3 a 100 letras, números, puntos o guiones.' },
  { key: 'firstName', label: 'Nombre', type: 'text', autocomplete: 'given-name', maxLength: 100, placeholder: 'Tu nombre', hint: 'Máximo 100 caracteres.' },
  { key: 'lastName', label: 'Apellido', type: 'text', autocomplete: 'family-name', maxLength: 100, placeholder: 'Tu apellido', hint: 'Máximo 100 caracteres.' },
  { key: 'email', label: 'Correo electrónico', type: 'email', autocomplete: 'email', maxLength: 254, placeholder: 'nombre@ejemplo.com', hint: 'Escribe un correo válido.' },
  { key: 'password', label: 'Contraseña', type: 'password', autocomplete: 'new-password', maxLength: 200, placeholder: 'Mínimo 8 caracteres', hint: 'De 8 a 200 caracteres. Los espacios se conservan.' },
  { key: 'confirmPassword', label: 'Confirmar contraseña', type: 'password', autocomplete: 'new-password', maxLength: 200, placeholder: 'Repite la contraseña', hint: 'Debe coincidir exactamente con la contraseña.' },
];

export const LOGIN_FIELD_DEFINITIONS: readonly FormFieldDefinition[] = [
  { key: 'username', label: 'Usuario', type: 'text', autocomplete: 'username', maxLength: 100, placeholder: 'Tu usuario', hint: 'Escribe el usuario de tu cuenta.' },
  { key: 'password', label: 'Contraseña', type: 'password', autocomplete: 'current-password', maxLength: 200, placeholder: 'Tu contraseña', hint: 'Escribe tu contraseña actual.' },
];

const builder = new FormBuilder().nonNullable;
const controlCharacters = /[\u0000-\u001f\u007f]/;
const trimmed = (control: AbstractControl): string => String(control.value ?? '').trim();
const visibleText: ValidatorFn = control => trimmed(control) ? null : { required: true };
const safeText: ValidatorFn = control => controlCharacters.test(trimmed(control)) ? { controlCharacters: true } : null;

/** PHP usa mb_strlen: contar puntos Unicode evita rechazar nombres con emoji antes que la API. */
function maxCharacters(max: number, trimValue = true): ValidatorFn {
  return control => {
    const value = trimValue ? trimmed(control) : String(control.value ?? '');
    const length = Array.from(value).length;
    return length > max ? { maxlength: { requiredLength: max, actualLength: length } } : null;
  };
}

const usernameFormat: ValidatorFn = control => {
  const value = trimmed(control);
  return !value || /^[a-zA-Z0-9_.-]{3,100}$/.test(value) ? null : { username: true };
};

const emailFormat: ValidatorFn = control => {
  const value = trimmed(control);
  if (!value) return null;
  // Validators.email lee únicamente value. La normalización coincide con el payload.
  const emailError = Validators.email({ value } as AbstractControl);
  const domain = value.slice(value.lastIndexOf('@') + 1);
  return emailError || !domain.includes('.') ? { email: true } : null;
};

const passwordFormat: ValidatorFn = control => {
  const value = String(control.value ?? '');
  if (value === '') return null; // En edición es opcional; required depende del modo.
  const length = Array.from(value).length;
  if (!value.trim()) return { blankPassword: true };
  if (controlCharacters.test(value)) return { controlCharacters: true };
  if (length < 8) return { minlength: { requiredLength: 8, actualLength: length } };
  return length > 200 ? { maxlength: { requiredLength: 200, actualLength: length } } : null;
};

const matchingPasswords: ValidatorFn = group => {
  const password = group.get('password')?.value;
  const confirmation = group.get('confirmPassword')?.value;
  if (password && !confirmation) return { passwordConfirmationRequired: true };
  return password !== confirmation ? { passwordMismatch: true } : null;
};

export function createLoginForm() {
  return builder.group({
    username: ['', [Validators.required, visibleText, maxCharacters(100)]],
    // Las reglas de alta no deben bloquear contraseñas existentes más cortas.
    password: ['', [Validators.required, maxCharacters(200, false)]],
  });
}

export function createUserForm(mode: UserFormMode = 'create') {
  const form = builder.group({
    username: ['', [Validators.required, visibleText, safeText, maxCharacters(100), usernameFormat]],
    firstName: ['', [Validators.required, visibleText, safeText, maxCharacters(100)]],
    lastName: ['', [Validators.required, visibleText, safeText, maxCharacters(100)]],
    email: ['', [Validators.required, visibleText, safeText, maxCharacters(254), emailFormat]],
    password: ['', [passwordFormat]],
    confirmPassword: ['', [maxCharacters(200, false)]],
  }, { validators: matchingPasswords });
  setUserFormMode(form, mode);
  return form;
}

export type UserForm = ReturnType<typeof createUserForm>;
export type LoginForm = ReturnType<typeof createLoginForm>;

export function setUserFormMode(form: UserForm, mode: UserFormMode): void {
  form.controls.password.setValidators(mode === 'create' ? [Validators.required, passwordFormat] : [passwordFormat]);
  form.controls.confirmPassword.setValidators(mode === 'create'
    ? [Validators.required, maxCharacters(200, false)]
    : [maxCharacters(200, false)]);
  form.controls.password.updateValueAndValidity({ onlySelf: true, emitEvent: false });
  form.controls.confirmPassword.updateValueAndValidity({ onlySelf: true, emitEvent: false });
  form.updateValueAndValidity();
}

/** La confirmación es solo UI y una contraseña vacía no cambia la existente. */
export function userInputFromForm(form: UserForm): UserInput {
  const value = form.getRawValue();
  const input: UserInput = {
    username: value.username.trim(),
    firstName: value.firstName.trim(),
    lastName: value.lastName.trim(),
    email: value.email.trim(),
  };
  if (value.password !== '') input.password = value.password;
  return input;
}

export function getFieldError(form: FormGroup, field: string, submitted = false): string {
  const definition = USER_FIELD_DEFINITIONS.find(item => item.key === field);
  if (!definition || !Object.hasOwn(form.controls, field)) return '';
  const control = form.controls[field];
  if (control.disabled || !(submitted || control.touched || control.dirty)) return '';
  const errors: ValidationErrors = control.errors ?? {};
  if (errors['required'] || (field === 'confirmPassword' && form.hasError('passwordConfirmationRequired'))) {
    return field === 'confirmPassword' ? 'Confirma tu contraseña.' : `Completa el campo ${definition.label.toLowerCase()}.`;
  }
  if (errors['controlCharacters']) return 'No uses saltos de línea ni caracteres de control.';
  if (errors['blankPassword']) return 'La contraseña no puede contener solamente espacios.';
  if (errors['minlength']) return `Escribe al menos ${errors['minlength'].requiredLength} caracteres.`;
  if (errors['maxlength']) return `Usa como máximo ${errors['maxlength'].requiredLength} caracteres.`;
  if (errors['username']) return 'Usa de 3 a 100 letras, números, puntos o guiones; sin espacios.';
  if (errors['email']) return 'Escribe un correo electrónico válido, como nombre@ejemplo.com.';
  if (field === 'confirmPassword' && form.hasError('passwordMismatch')) return 'Las contraseñas no coinciden.';
  return typeof errors['server'] === 'string' ? errors['server'] : '';
}

function safeServerMessage(message: string, label: string): string {
  const value = message.trim();
  if (!value || value.length > 250 || /[<>\u0000-\u001f\u007f]|SQLSTATE|PDOException|SQLException|TypeError|ReferenceError|SyntaxError|stack\s*trace|Fatal\s+error|(?:\/var\/)|(?:[A-Z]:\\)/i.test(value)) {
    return `Revisa el campo ${label.toLowerCase()}.`;
  }
  return value;
}

/** Solo acepta errores de validación y claves del modelo, nunca rutas arbitrarias. */
export function applyServerErrors(form: FormGroup, error: unknown): boolean {
  if (!axios.isAxiosError(error) || ![400, 422].includes(error.response?.status ?? 0)) return false;
  const data: unknown = error.response?.data;
  if (!data || typeof data !== 'object' || !('errors' in data)) return false;
  const errors = data.errors;
  if (!errors || typeof errors !== 'object' || Array.isArray(errors)) return false;
  let applied = false;
  for (const definition of USER_FIELD_DEFINITIONS) {
    const key = definition.key;
    if (!Object.hasOwn(form.controls, key) || !Object.hasOwn(errors, key)) continue;
    const message: unknown = (errors as Record<string, unknown>)[key];
    if (typeof message !== 'string') continue;
    const control = form.controls[key];
    control.setErrors({ ...control.errors, server: safeServerMessage(message, definition.label) });
    control.markAsTouched();
    applied = true;
  }
  return applied;
}

/** En Angular sin Zone.js los estados touched/dirty también deben refrescar la vista. */
export function bindFormChanges(form: FormGroup, onChange: () => void): Subscription {
  const previousValues = new Map(Object.entries(form.controls).map(([key, control]) => [key, control.value]));
  return form.events.subscribe(event => {
    if (event instanceof ValueChangeEvent) {
      for (const [key, control] of Object.entries(form.controls)) {
        if (previousValues.get(key) !== control.value && control.hasError('server')) {
          const errors = { ...control.errors };
          delete errors['server'];
          control.setErrors(Object.keys(errors).length ? errors : null, { emitEvent: false });
        }
        previousValues.set(key, control.value);
      }
    }
    onChange();
  });
}
