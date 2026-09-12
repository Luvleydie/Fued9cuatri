import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular/lazy';
import { ProfilePage } from './profile.page';
import { ProfilePageRoutingModule } from './profile-routing.module';

@NgModule({ declarations: [ProfilePage], imports: [CommonModule, IonicModule, ProfilePageRoutingModule] })
export class ProfilePageModule {}
