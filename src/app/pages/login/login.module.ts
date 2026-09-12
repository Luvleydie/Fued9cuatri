import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular/lazy';
import { LoginPage } from './login.page';
import { LoginPageRoutingModule } from './login-routing.module';

@NgModule({
  declarations: [LoginPage],
  imports: [CommonModule, ReactiveFormsModule, IonicModule, LoginPageRoutingModule],
})
export class LoginPageModule {}
