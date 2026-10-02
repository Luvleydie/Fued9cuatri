import axios from 'axios';
import { environment } from '../../../environments/environment';
import { readToken } from './session-storage';
import { isRecoverableReadError, OfflineError } from './api-errors';
import { connectionState } from './connection-state';

const api = axios.create({
  baseURL: new URL(environment.apiUrl, document.baseURI).href,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

api.interceptors.request.use((config) => {
  if (connectionState.offline()) throw new OfflineError();
  const token = readToken();
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

api.interceptors.response.use(
  (response) => {
    if (response.status >= 500 && response.status <= 599) connectionState.markApiUnavailable();
    else connectionState.markApiAvailable();
    return response;
  },
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      if (isRecoverableReadError(error)) connectionState.markApiUnavailable();
      else if (error.response) connectionState.markApiAvailable();
    }
    return Promise.reject(error);
  },
);

export default api;
