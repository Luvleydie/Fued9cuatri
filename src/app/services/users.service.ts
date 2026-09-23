import { Injectable } from '@angular/core';
import api from '../core/api/axios-client';
import { User, UsersResponse } from '../models/user.model';
import { UserInput } from '../models/user-input.model';

@Injectable({ providedIn: 'root' })
export class UsersService {
  async getUsers(): Promise<User[]> {
    const { data } = await api.get<UsersResponse>('/users');
    return data.users;
  }

  async createUser(input: UserInput): Promise<User> {
    const { data } = await api.post<User>('/users', input);
    return data;
  }

  async updateUser(id: number, input: UserInput): Promise<User> {
    const { data } = await api.put<User>(`/users/${id}`, input);
    return data;
  }

  async deleteUser(id: number): Promise<void> {
    await api.delete(`/users/${id}`);
  }
}
