import axios from 'axios';
import { environment } from '../../../environments/environment';
import { readToken } from './session-storage';

const api = axios.create({
  baseURL: environment.apiUrl,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = readToken();
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

export default api;
