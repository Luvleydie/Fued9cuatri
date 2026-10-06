import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, Input, OnChanges, ViewChild } from '@angular/core';
import { arc, axisBottom, axisLeft, max, pie, scaleBand, scaleLinear, select } from 'd3';
import { CartItem } from '../models/cart-item.model';
import { Product } from '../models/product.model';

interface CartAmount {
  productId: number;
  title: string;
  quantity: number;
  amount: number;
}

@Component({
  selector: 'app-cart-charts',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cart-charts.component.html',
})
export class CartChartsComponent implements AfterViewInit, OnChanges {
  @Input() products: Product[] = [];
  @Input() items: CartItem[] = [];
  @Input() loading = false;
  @Input() cached = false;
  @ViewChild('priceSvg', { static: true }) private priceSvg!: ElementRef<SVGSVGElement>;
  @ViewChild('stockSvg', { static: true }) private stockSvg!: ElementRef<SVGSVGElement>;
  @ViewChild('cartSvg', { static: true }) private cartSvg!: ElementRef<SVGSVGElement>;
  private ready = false;
  private readonly colors = ['#7257cf', '#5e947c', '#bf8b60', '#7489c5', '#b06f97', '#889559'];
  private readonly currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 });

  get cartAmounts(): CartAmount[] {
    return this.items.map(item => ({ productId: item.productId, title: item.title, quantity: item.quantity, amount: item.price * item.quantity }));
  }
  get cartTotal(): number { return this.cartAmounts.reduce((sum, item) => sum + item.amount, 0); }

  colorOf(productId: number): string { return this.colors[productId % this.colors.length]; }
  percentage(amount: number): string { return this.cartTotal > 0 ? `${(amount / this.cartTotal * 100).toFixed(1)} %` : 'Sin importe'; }

  ngAfterViewInit(): void { this.ready = true; this.render(); }
  ngOnChanges(): void { if (this.ready) this.render(); }

  private render(): void {
    this.renderPrices();
    this.renderStocks();
    this.renderCart();
  }

  private renderPrices(): void {
    const width = 400;
    const height = Math.max(280, this.products.length * 42 + 60);
    const margin = { top: 15, right: 85, bottom: 38, left: 115 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const svg = select(this.priceSvg.nativeElement).attr('viewBox', `0 0 ${width} ${height}`);
    const x = scaleLinear().domain([0, max(this.products, product => product.price) || 1]).range([0, innerWidth]);
    const y = scaleBand<number>().domain(this.products.map(product => product.id)).range([0, innerHeight]).padding(.34);
    const names = new Map(this.products.map(product => [product.id, product.title]));
    const plot = svg.selectAll<SVGGElement, number>('g.price-plot').data([0]).join('g').attr('class', 'price-plot').attr('transform', `translate(${margin.left},${margin.top})`);

    plot.selectAll<SVGGElement, number>('g.price-x-axis').data([0]).join('g').attr('class', 'price-x-axis')
      .attr('transform', `translate(0,${innerHeight})`).call(axisBottom(x).ticks(3).tickFormat(value => this.currency.format(Number(value))));
    plot.selectAll<SVGGElement, number>('g.price-y-axis').data([0]).join('g').attr('class', 'price-y-axis')
      .call(axisLeft(y).tickSize(0).tickPadding(10).tickFormat(id => this.shortTitle(names.get(id) || '', 13)));

    const bars = plot.selectAll<SVGRectElement, Product>('rect.price-bar').data(this.products, product => product.id).join('rect')
      .attr('class', 'price-bar').attr('data-product-id', product => product.id).attr('data-value', product => product.price)
      .attr('x', 0).attr('y', product => y(product.id) || 0).attr('width', product => x(product.price)).attr('height', y.bandwidth())
      .attr('rx', 4).attr('fill', '#7257cf').attr('tabindex', 0).attr('role', 'img')
      .attr('aria-label', product => `${product.title}: ${this.currency.format(product.price)} MXN por unidad`);
    bars.selectAll<SVGTitleElement, Product>('title').data(product => [product]).join('title')
      .text(product => `${product.title}: ${this.currency.format(product.price)} MXN por unidad`);
    plot.selectAll<SVGTextElement, Product>('text.price-label').data(this.products, product => product.id).join('text')
      .attr('class', 'price-label').attr('x', product => x(product.price) + 7).attr('y', product => (y(product.id) || 0) + y.bandwidth() / 2)
      .attr('dy', '.35em').attr('font-size', 14).attr('fill', '#514b63').text(product => this.currency.format(product.price));
    this.styleAxes(svg);
  }

  private renderStocks(): void {
    const width = 400;
    const height = 300;
    const margin = { top: 25, right: 15, bottom: 70, left: 45 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const svg = select(this.stockSvg.nativeElement).attr('viewBox', `0 0 ${width} ${height}`);
    const x = scaleBand<number>().domain(this.products.map(product => product.id)).range([0, innerWidth]).padding(.3);
    const y = scaleLinear().domain([0, max(this.products, product => product.stock) || 1]).nice().range([innerHeight, 0]);
    const names = new Map(this.products.map(product => [product.id, product.title]));
    const plot = svg.selectAll<SVGGElement, number>('g.stock-plot').data([0]).join('g').attr('class', 'stock-plot').attr('transform', `translate(${margin.left},${margin.top})`);

    plot.selectAll<SVGGElement, number>('g.stock-x-axis').data([0]).join('g').attr('class', 'stock-x-axis')
      .attr('transform', `translate(0,${innerHeight})`).call(axisBottom(x).tickSize(0).tickPadding(12).tickFormat(id => this.shortTitle(names.get(id) || '', 12)));
    plot.selectAll<SVGGElement, number>('g.stock-y-axis').data([0]).join('g').attr('class', 'stock-y-axis')
      .call(axisLeft(y).ticks(Math.min(5, max(this.products, product => product.stock) || 1)).tickFormat(value => String(Number(value))));

    const bars = plot.selectAll<SVGRectElement, Product>('rect.stock-bar').data(this.products, product => product.id).join('rect')
      .attr('class', 'stock-bar').attr('data-product-id', product => product.id).attr('data-value', product => product.stock)
      .attr('x', product => x(product.id) || 0).attr('y', product => y(product.stock)).attr('width', x.bandwidth())
      .attr('height', product => innerHeight - y(product.stock)).attr('rx', 4).attr('fill', '#5e947c')
      .attr('tabindex', 0).attr('role', 'img').attr('aria-label', product => `${product.title}: ${product.stock} unidades disponibles`);
    bars.selectAll<SVGTitleElement, Product>('title').data(product => [product]).join('title')
      .text(product => `${product.title}: ${product.stock} unidades disponibles`);
    plot.selectAll<SVGTextElement, Product>('text.stock-label-value').data(this.products, product => product.id).join('text')
      .attr('class', 'stock-label-value').attr('x', product => (x(product.id) || 0) + x.bandwidth() / 2).attr('y', product => y(product.stock) - 8)
      .attr('text-anchor', 'middle').attr('font-size', 15).attr('fill', '#514b63').text(product => product.stock);
    this.styleAxes(svg);
  }

  private renderCart(): void {
    const svg = select(this.cartSvg.nativeElement).attr('viewBox', '0 0 360 280');
    const amounts = this.cartAmounts.filter(item => item.amount > 0);
    const sectors = pie<CartAmount>().sort(null).value(item => item.amount)(amounts);
    const shape = arc<(typeof sectors)[number]>().innerRadius(68).outerRadius(112).padAngle(.02).cornerRadius(4);
    const plot = svg.selectAll<SVGGElement, number>('g.cart-plot').data([0]).join('g').attr('class', 'cart-plot').attr('transform', 'translate(180,140)');
    const slices = plot.selectAll<SVGPathElement, (typeof sectors)[number]>('path.cart-slice').data(sectors, sector => sector.data.productId).join('path')
      .attr('class', 'cart-slice').attr('data-product-id', sector => sector.data.productId).attr('data-value', sector => sector.data.amount)
      .attr('d', shape).attr('fill', sector => this.colorOf(sector.data.productId)).attr('tabindex', 0).attr('role', 'img')
      .attr('aria-label', sector => `${sector.data.title}: ${this.currency.format(sector.data.amount)} MXN, ${this.percentage(sector.data.amount)} del importe guardado`);
    slices.selectAll<SVGTitleElement, (typeof sectors)[number]>('title').data(sector => [sector]).join('title')
      .text(sector => `${sector.data.title}: ${this.currency.format(sector.data.amount)} MXN (${this.percentage(sector.data.amount)})`);
    plot.selectAll<SVGTextElement, number>('text.cart-center-caption').data(amounts.length ? [0] : []).join('text')
      .attr('class', 'cart-center-caption').attr('text-anchor', 'middle').attr('y', -7).attr('font-size', 12).attr('fill', '#716d85').text('Importe guardado');
    plot.selectAll<SVGTextElement, number>('text.cart-center-total').data(amounts.length ? [0] : []).join('text')
      .attr('class', 'cart-center-total').attr('text-anchor', 'middle').attr('y', 18).attr('font-size', 20).attr('font-weight', 650).attr('fill', '#27243d').text(this.currency.format(this.cartTotal));
  }

  private shortTitle(title: string, length = 20): string { return title.length > length ? `${title.slice(0, length - 1)}…` : title; }

  private styleAxes(svg: ReturnType<typeof select<SVGSVGElement, unknown>>): void {
    svg.selectAll('.domain, .tick line').attr('stroke', '#e6e3ef');
    svg.selectAll('.tick text').attr('fill', '#716d85').attr('font-size', 14);
  }
}
