import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular/lazy';
import { CartPageRoutingModule } from './cart-routing.module';
import { CartPage } from './cart.page';

@NgModule({
  imports: [CommonModule, IonicModule, CartPageRoutingModule],
  declarations: [CartPage],
})
export class CartPageModule {}
