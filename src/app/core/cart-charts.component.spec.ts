import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CartChartsComponent } from './cart-charts.component';

describe('Gráficas D3 del catálogo y carrito', () => {
  let fixture: ComponentFixture<CartChartsComponent>;
  const products = [{ id: 11, title: 'Accesorio', price: 125, stock: 5 }, { id: 12, title: 'Accesorio', price: 50, stock: 3 }];
  const item = { productId: 11, title: 'Accesorio', price: 125, stock: 5, quantity: 2 };
  const query = (selector: string): Element[] => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll(selector));

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CartChartsComponent] }).compileComponents();
    fixture = TestBed.createComponent(CartChartsComponent);
  });
  afterEach(() => { fixture.destroy(); TestBed.resetTestingModule(); });

  it('usa identificadores para separar títulos repetidos y longitudes proporcionales al precio', () => {
    fixture.componentRef.setInput('products', products);
    fixture.detectChanges();
    const bars = query('.price-bar');
    expect(bars).toHaveLength(2);
    expect(Number(bars[0].getAttribute('width')) / Number(bars[1].getAttribute('width'))).toBeCloseTo(2.5);
    expect(bars[0].getAttribute('data-product-id')).toBe('11');
    expect(bars[0].getAttribute('aria-label')).toContain('125.00');
    expect(query('.stock-bar').map(bar => bar.getAttribute('data-value'))).toEqual(['5', '3']);
    expect(query('svg').every(svg => Boolean(svg.getAttribute('viewBox')))).toBe(true);
  });

  it('actualiza y elimina marcas sin duplicarlas al cambiar los datos', () => {
    fixture.componentRef.setInput('products', products);
    fixture.componentRef.setInput('items', [item]);
    fixture.detectChanges();
    const original = query('.cart-slice')[0];
    expect(original.getAttribute('data-value')).toBe('250');
    fixture.componentRef.setInput('items', [{ ...item, quantity: 3 }]);
    fixture.componentRef.setInput('products', [products[0]]);
    fixture.detectChanges();
    expect(query('.cart-slice')).toHaveLength(1);
    expect(query('.cart-slice')[0]).toBe(original);
    expect(original.getAttribute('data-value')).toBe('375');
    expect(query('.price-bar')).toHaveLength(1);
    expect(query('.stock-bar')).toHaveLength(1);
    fixture.componentRef.setInput('items', []);
    fixture.detectChanges();
    expect(query('.cart-slice')).toHaveLength(0);
  });

  it('representa datos vacíos y precios cero sin porcentajes ni geometría inválida', () => {
    fixture.detectChanges();
    expect(query('.price-bar')).toHaveLength(0);
    expect(query('.cart-slice')).toHaveLength(0);
    fixture.componentRef.setInput('products', [{ ...products[0], price: 0, stock: 0 }]);
    fixture.componentRef.setInput('items', [{ ...item, price: 0 }]);
    fixture.detectChanges();
    expect(query('.cart-slice')).toHaveLength(0);
    expect(query('.price-bar')[0].getAttribute('width')).toBe('0');
    expect(query('.stock-bar')[0].getAttribute('height')).toBe('0');
    expect(fixture.componentInstance.percentage(0)).toBe('Sin importe');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('El importe guardado es cero');
    expect((fixture.nativeElement as HTMLElement).innerHTML).not.toMatch(/NaN|Infinity/);
    expect(query('.chart-details table tbody tr')).toHaveLength(3);
  });
});
