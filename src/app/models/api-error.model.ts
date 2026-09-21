/** Respuesta de error de la API. Las claves de errors corresponden a campos. */
export interface ApiError {
  message: string;
  errors?: Record<string, string>;
}
