import axios from 'axios';

/** La petición se detuvo antes de enviarse; no existe una escritura pendiente. */
export class OfflineError extends Error {
  readonly code = 'ERR_OFFLINE';

  constructor() {
    super('Sin conexión a Internet.');
    this.name = 'OfflineError';
  }
}

export function isRecoverableReadError(error: unknown): boolean {
  if (error instanceof OfflineError) return true;
  if (!axios.isAxiosError(error) || axios.isCancel(error) || error.code === 'ERR_CANCELED') return false;
  if (error.response) return error.response.status >= 500 && error.response.status <= 599;
  return ['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'].includes(error.code ?? '') || !!error.request;
}

function safeValidationMessage(data: unknown): string | undefined {
  if (!data || typeof data !== 'object' || !('message' in data) || typeof data.message !== 'string') return undefined;
  const message = data.message.trim();
  // Un error HTML, una traza o un mensaje de base de datos no es texto para el usuario.
  if (!message || message.length > 300 || /[<>\u0000-\u001f]|SQLSTATE|PDOException|SQLException|TypeError|ReferenceError|SyntaxError|stack\s*trace|Fatal\s+error|(?:\/var\/)|(?:[A-Z]:\\)/i.test(message)) return undefined;
  return message;
}

/** Mensajes compartidos: los detalles internos nunca se muestran en errores 5xx. */
export function getErrorMessage(error: unknown, fallback: string, mutation = false): string {
  if (error instanceof OfflineError) {
    return mutation
      ? 'Sin conexión a Internet. La operación no se envió. Vuelve a conectarte e inténtalo de nuevo.'
      : 'Sin conexión a Internet. Puedes consultar los datos guardados, si están disponibles. Vuelve a conectarte para actualizar.';
  }
  if (error instanceof Error && ['DataValidationError', 'CacheMissError', 'SessionChangedError'].includes(error.name)) {
    if (mutation && error.name === 'DataValidationError') {
      return 'El servicio respondió con datos inválidos. No pudimos confirmar el resultado. Actualiza los datos antes de volver a intentarlo.';
    }
    return safeValidationMessage(error) ?? fallback;
  }
  if (!axios.isAxiosError(error)) return fallback;

  if (isRecoverableReadError(error)) {
    if (mutation) {
      return 'No pudimos confirmar si se guardaron los cambios. Revisa tu conexión y actualiza los datos antes de volver a intentarlo para evitar duplicados.';
    }
    if (error.response) return 'El servicio no está disponible temporalmente. Inténtalo de nuevo en unos minutos.';
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return 'El servicio tardó demasiado en responder. Revisa tu conexión e inténtalo de nuevo.';
    }
    return 'No pudimos conectar con el servicio. Revisa tu conexión e inténtalo de nuevo.';
  }

  const status = error.response?.status;
  if (status && status >= 400 && status <= 499) {
    const message = safeValidationMessage(error.response?.data);
    if (message) return message;
    switch (status) {
      case 400: return 'Revisa los datos enviados e inténtalo de nuevo.';
      case 401: return 'Tu sesión no es válida o ha vencido. Inicia sesión nuevamente.';
      case 403: return 'No tienes permiso para realizar esta acción.';
      case 404: return 'No encontramos los datos solicitados. Actualiza la lista e inténtalo de nuevo.';
      case 409: return 'Los datos entran en conflicto con un registro existente. Actualiza y revisa la información.';
      case 422: return 'Revisa los datos del formulario y corrige los campos indicados.';
      case 429: return 'Has realizado demasiadas solicitudes. Espera un momento antes de volver a intentarlo.';
      default: return fallback;
    }
  }
  return fallback;
}
