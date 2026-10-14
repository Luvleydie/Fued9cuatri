// El comando mobile:build proporciona este valor con --define, sin guardar
// direcciones de la red local dentro del código fuente.
declare const NOVACART_API_URL: string;

export const environment = {
  production: true,
  apiUrl: NOVACART_API_URL,
};
