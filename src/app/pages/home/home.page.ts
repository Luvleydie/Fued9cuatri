import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular/lazy';
import axios from 'axios';
import api from '../../core/api/axios-client';
import { clearSession, readUser, updateStoredUser } from '../../core/api/session-storage';
import { ConnectionNoticeComponent } from '../../core/connection-notice.component';
import { AppNavigationComponent } from '../../core/app-navigation.component';
import { connectionState } from '../../core/api/connection-state';
import { getErrorMessage, isRecoverableReadError } from '../../core/api/api-errors';
import { CachedResult, DataValidationError } from '../../core/api/data-cache';
import { cacheNotice } from '../../core/cache-notice';
import { applyServerErrors, bindFormChanges, createUserForm, getFieldError, setUserFormMode, USER_FIELD_DEFINITIONS, userInputFromForm } from '../../core/forms/form-models';
import { User } from '../../models/user.model';
import { UsersService } from '../../services/users.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IonicModule, ConnectionNoticeComponent, AppNavigationComponent],
})
export class HomePage implements OnInit, OnDestroy {
  users: User[] = [];
  searchTerm = '';
  currentUser: User | null = readUser();
  readonly userForm = createUserForm();
  readonly userFields = USER_FIELD_DEFINITIONS;
  submitted = false;
  private formChanges?: Subscription;
  editingId: number | null = null;
  isLoading = false;
  isSubmitting = false;
  errorMessage = '';
  successMessage = '';
  readonly connection = connectionState;
  snapshot: CachedResult<User[]> | null = null;
  needsRefresh = false;

  get readOnly(): boolean { return this.connection.offline() || this.snapshot?.source === 'cache' || this.needsRefresh; }
  get dataNotice(): string { return cacheNotice(this.snapshot, this.connection.offline()); }
  get hasSearch(): boolean { return this.normalizeSearch(this.searchTerm).length > 0; }
  get filteredUsers(): User[] {
    const query = this.normalizeSearch(this.searchTerm);
    if (!query) return this.users;
    return this.users.filter(user => this.normalizeSearch(
      `${user.username} ${user.firstName ?? ''} ${user.lastName ?? ''} ${user.email ?? ''}`,
    ).includes(query));
  }
  get dataStateLabel(): string {
    if (this.isLoading) return 'Actualizando';
    if (this.connection.offline()) return 'Sin conexión';
    if (this.snapshot?.source === 'cache') return 'Copia temporal';
    if (this.needsRefresh) return 'Actualización pendiente';
    return this.snapshot ? 'Datos actualizados' : 'Sin datos cargados';
  }

  constructor(private usersService: UsersService, private router: Router, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.formChanges = bindFormChanges(this.userForm, () => this.cdr.markForCheck());
    void this.loadUsers();
  }

  ngOnDestroy(): void { this.formChanges?.unsubscribe(); }

  fieldError(field: string): string { return getFieldError(this.userForm, field, this.submitted); }

  fieldId(field: string): string { return field === 'confirmPassword' ? 'user-confirm-password' : `user-${field}`; }

  updateSearch(event: Event): void {
    this.searchTerm = (event.target as HTMLInputElement).value;
  }

  clearSearch(): void { this.searchTerm = ''; }

  initials(user: User): string {
    const names = [user.firstName ?? '', user.lastName ?? ''].map(name => name.trim()).filter(name => name.length > 0);
    return (names.length
      ? names.map(name => Array.from(name)[0]).join('')
      : Array.from(user.username.trim()).slice(0, 2).join('')).toLocaleUpperCase('es');
  }

  private normalizeSearch(value: string): string {
    return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es').trim().replace(/\s+/g, ' ');
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
      this.snapshot = await this.usersService.getUsers();
      this.users = this.snapshot.data;
      this.needsRefresh = this.snapshot.source === 'cache';
      this.currentUser = this.users.find(user => user.id === this.currentUser?.id) ?? this.currentUser;
    } catch (error: unknown) {
      this.snapshot = null;
      this.users = [];
      this.needsRefresh = true;
      await this.handleError(error, 'No se pudieron cargar los usuarios. Intenta de nuevo.');
      if (isRecoverableReadError(error)) this.errorMessage += ' No hay copia temporal válida. Conéctate y pulsa Actualizar.';
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  editUser(user: User): void {
    if (this.isSubmitting || this.isLoading || this.readOnly) return;
    this.editingId = user.id;
    setUserFormMode(this.userForm, 'edit');
    this.userForm.reset({
      username: user.username, firstName: user.firstName ?? '', lastName: user.lastName ?? '',
      email: user.email ?? '', password: '', confirmPassword: '',
    });
    this.submitted = false;
    this.errorMessage = '';
    this.successMessage = '';
  }

  cancelEdit(): void {
    this.editingId = null;
    setUserFormMode(this.userForm, 'create');
    this.userForm.reset();
    this.submitted = false;
  }

  async saveUser(): Promise<void> {
    if (this.isSubmitting || this.isLoading || this.readOnly) return;
    this.errorMessage = '';
    this.successMessage = '';
    this.submitted = true;
    if (this.userForm.invalid || this.userForm.pending || this.userForm.disabled) {
      this.userForm.markAllAsTouched();
      this.errorMessage = 'Revisa los campos indicados antes de guardar.';
      return;
    }
    const input = userInputFromForm(this.userForm);
    this.isSubmitting = true;
    this.userForm.disable({ emitEvent: false });
    const id = this.editingId;
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
      this.userForm.enable({ emitEvent: false });
      applyServerErrors(this.userForm, error);
      this.needsRefresh = isRecoverableReadError(error) || error instanceof DataValidationError;
      await this.handleError(error, 'No se pudo guardar. Tus datos siguen en el formulario.', true);
    } finally {
      if (this.userForm.disabled) this.userForm.enable({ emitEvent: false });
      this.isSubmitting = false;
      this.cdr.markForCheck();
    }
    if (this.successMessage && readUser()) await this.loadUsers();
  }

  async deleteUser(user: User): Promise<void> {
    if (this.isSubmitting || this.isLoading || this.readOnly || user.id === this.currentUser?.id) return;
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
      this.needsRefresh = isRecoverableReadError(error) || error instanceof DataValidationError;
      await this.handleError(error, 'No se pudo eliminar el usuario.', true);
    } finally {
      this.isSubmitting = false;
      this.cdr.markForCheck();
    }
    if (this.successMessage) await this.loadUsers();
  }

  async logout(): Promise<void> {
    if (this.isSubmitting) return;
    this.isSubmitting = true;
    try { await api.post('/auth/logout'); }
    catch { /* También permite salir cuando la API no está disponible. */ }
    finally {
      clearSession();
      this.users = [];
      this.searchTerm = '';
      this.snapshot = null;
      this.currentUser = null;
      this.cancelEdit();
      await this.router.navigateByUrl('/login', { replaceUrl: true });
      this.isSubmitting = false;
      this.cdr.markForCheck();
    }
  }

  private async handleError(error: unknown, fallback: string, mutation = false): Promise<void> {
    this.errorMessage = getErrorMessage(error, fallback, mutation);
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      clearSession();
      this.snapshot = null;
      this.users = [];
      this.searchTerm = '';
      this.currentUser = null;
      this.cancelEdit();
      await this.router.navigateByUrl('/login?expired=1', { replaceUrl: true });
    }
  }
}
