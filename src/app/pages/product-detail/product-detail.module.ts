import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular/lazy';
import { ProductDetailPageRoutingModule } from './product-detail-routing.module';
import { ProductDetailPage } from './product-detail.page';

@NgModule({
  imports: [CommonModule, IonicModule, ProductDetailPageRoutingModule],
  declarations: [ProductDetailPage],
})
export class ProductDetailPageModule {}
