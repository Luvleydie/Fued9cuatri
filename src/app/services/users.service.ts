import { Injectable } from '@angular/core';
import api from '../core/api/axios-client';
import { User, UsersResponse } from '../models/user.model';
import { UserInput } from '../models/user-input.model';
import { CachedResult, fetchWithCache, invalidateDataCache, runSessionMutation, SessionChangedError } from '../core/api/data-cache';
import { projectUser, projectUsers } from '../core/api/data-projections';
import { readCacheScope } from '../core/api/session-storage';

@Injectable({ providedIn: 'root' })
export class UsersService {
  async getUsers(): Promise<CachedResult<User[]>> {
    const scope = readCacheScope();
    return fetchWithCache('users', scope, readCacheScope, async () => {
      const { data } = await api.get<UsersResponse>('/users');
      return data?.users;
    }, projectUsers);
  }

  async createUser(input: UserInput): Promise<User> {
    const scope = readCacheScope();
    const { data } = await runSessionMutation(scope, readCacheScope, () => api.post<User>('/users', input));
    if (scope !== readCacheScope()) throw new SessionChangedError();
    invalidateDataCache('users', scope);
    return projectUser(data);
  }

  async updateUser(id: number, input: UserInput): Promise<User> {
    const scope = readCacheScope();
    const { data } = await runSessionMutation(scope, readCacheScope, () => api.put<User>(`/users/${id}`, input));
    if (scope !== readCacheScope()) throw new SessionChangedError();
    invalidateDataCache('users', scope);
    return projectUser(data);
  }

  async deleteUser(id: number): Promise<void> {
    const scope = readCacheScope();
    await runSessionMutation(scope, readCacheScope, () => api.delete(`/users/${id}`));
    if (scope !== readCacheScope()) throw new SessionChangedError();
    invalidateDataCache('users', scope);
  }
}
