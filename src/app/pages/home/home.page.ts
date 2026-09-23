import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular/lazy';
import axios, { AxiosError } from 'axios';
import api from '../../core/api/axios-client';
import { clearSession, readUser, updateStoredUser } from '../../core/api/session-storage';
import { ApiError } from '../../models/api-error.model';
import { User } from '../../models/user.model';
import { UserInput } from '../../models/user-input.model';
import { UsersService } from '../../services/users.service';

const emptyUser = (): UserInput => ({ username: '', firstName: '', lastName: '', email: '', password: '' });

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule, RouterModule],
})
export class HomePage implements OnInit {
  users: User[] = [];
  currentUser: User | null = readUser();
  userForm: UserInput = emptyUser();
  editingId: number | null = null;
  isLoading = false;
  isSubmitting = false;
  errorMessage = '';
  successMessage = '';

  constructor(private usersService: UsersService, private router: Router, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    void this.loadUsers();
  }

  ionViewWillEnter(): void {
    this.currentUser = readUser();
    void this.loadUsers();
  }

  async loadUsers(): Promise<void> {
    if (this.isLoading || this.isSubmitting) return;
    this.isLoading = true;
    this.errorMessage = '';
    try {
      this.users = await this.usersService.getUsers();
      this.currentUser = this.users.find(user => user.id === this.currentUser?.id) ?? this.currentUser;
    } catch (error: unknown) {
      await this.handleError(error, 'No se pudieron cargar los usuarios. Intenta de nuevo.');
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  editUser(user: User): void {
    if (this.isSubmitting || this.isLoading) return;
    this.editingId = user.id;
    this.userForm = {
      username: user.username, firstName: user.firstName ?? '', lastName: user.lastName ?? '',
      email: user.email ?? '', password: '',
    };
    this.errorMessage = '';
    this.successMessage = '';
  }

  cancelEdit(): void {
    this.editingId = null;
    this.userForm = emptyUser();
  }

  async saveUser(): Promise<void> {
    if (this.isSubmitting || this.isLoading) return;
    this.isSubmitting = true;
    this.errorMessage = '';
    this.successMessage = '';
    const id = this.editingId;
    const input: UserInput = {
      ...this.userForm, username: this.userForm.username.trim(), email: this.userForm.email.trim(),
      firstName: this.userForm.firstName.trim(), lastName: this.userForm.lastName.trim(),
    };
    try {
      const user = id === null
        ? await this.usersService.createUser(input)
        : await this.usersService.updateUser(id, input);
      this.users = id === null ? [...this.users, user] : this.users.map(item => item.id === id ? user : item);
      this.cancelEdit();
      this.successMessage = id === null ? 'Usuario creado.' : 'Usuario actualizado.';
      if (user.id === this.currentUser?.id) {
        if (input.password) {
          clearSession();
          await this.router.navigateByUrl('/login?updated=1', { replaceUrl: true });
        } else {
          this.currentUser = user;
          try { updateStoredUser(user); }
          catch { clearSession(); await this.router.navigateByUrl('/login', { replaceUrl: true }); }
        }
      }
    } catch (error: unknown) {
      await this.handleError(error, 'No se pudo guardar. Tus datos siguen en el formulario.');
    } finally {
      this.isSubmitting = false;
      this.cdr.markForCheck();
    }
  }

  async deleteUser(user: User): Promise<void> {
    if (this.isSubmitting || this.isLoading || user.id === this.currentUser?.id) return;
    if (!window.confirm(`¿Eliminar al usuario ${user.username}?`)) return;
    this.isSubmitting = true;
    this.errorMessage = '';
    this.successMessage = '';
    try {
      await this.usersService.deleteUser(user.id);
      this.users = this.users.filter(item => item.id !== user.id);
      if (this.editingId === user.id) this.cancelEdit();
      this.successMessage = 'Usuario eliminado.';
    } catch (error: unknown) {
      await this.handleError(error, 'No se pudo eliminar el usuario.');
    } finally {
      this.isSubmitting = false;
      this.cdr.markForCheck();
    }
  }

  async logout(): Promise<void> {
    if (this.isSubmitting) return;
    this.isSubmitting = true;
    try { await api.post('/auth/logout'); }
    catch { /* También permite salir cuando la API no está disponible. */ }
    finally {
      clearSession();
      this.users = [];
      this.currentUser = null;
      this.cancelEdit();
      await this.router.navigateByUrl('/login', { replaceUrl: true });
      this.isSubmitting = false;
      this.cdr.markForCheck();
    }
  }

  private async handleError(error: unknown, fallback: string): Promise<void> {
    if (axios.isAxiosError<ApiError>(error)) {
      const requestError: AxiosError<ApiError> = error;
      this.errorMessage = requestError.response?.data?.message || fallback;
      if (requestError.response?.status === 401) {
        clearSession();
        await this.router.navigateByUrl('/login', { replaceUrl: true });
      }
    } else {
      this.errorMessage = fallback;
    }
  }
}
