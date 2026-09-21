import { afterEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, CanceledError } from 'axios';
import api from '../core/api/axios-client';
import { MOCK_PRODUCTS } from '../data/mock-products';
import { ProductInput } from '../models/product-input.model';
import { filterProducts, ProductNotFoundError, ProductsService } from './products.service';

describe('ProductsService', () => {
  const service = new ProductsService();
  afterEach(() => vi.restoreAllMocks());

  it('obtiene todo el catálogo de la API para poder buscar en todos los productos', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { products: [MOCK_PRODUCTS[0]], total: 1, skip: 0, limit: 1 } });
    expect(await service.getProducts()).toEqual({ products: [MOCK_PRODUCTS[0]], source: 'api' });
    expect(get).toHaveBeenCalledWith('/products', { params: { limit: 0 } });
  });

  it('usa los seis productos locales cuando no hay conexión', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    const result = await service.getProducts();
    expect(result.source).toBe('local');
    expect(result.products).toHaveLength(6);
    expect(result.products.every((product) => product.thumbnail?.startsWith('assets/products/'))).toBe(true);
    expect(result.products).not.toBe(MOCK_PRODUCTS);
  });

  it('permite respaldo para una respuesta 503', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(Object.assign(new AxiosError('Unavailable'), { response: { status: 503 } }));
    expect((await service.getProducts()).source).toBe('local');
  });

  it.each([401, 403, 404, 429])('no oculta un error HTTP %s con datos locales', async (status) => {
    const error = Object.assign(new AxiosError('HTTP error'), { response: { status } });
    vi.spyOn(api, 'get').mockRejectedValue(error);
    await expect(service.getProducts()).rejects.toBe(error);
  });

  it('no activa respaldo ante una petición cancelada', async () => {
    const error = new CanceledError();
    vi.spyOn(api, 'get').mockRejectedValue(error);
    await expect(service.getProducts()).rejects.toBe(error);
  });

  it('no oculta un error de configuración de Axios', async () => {
    const error = new AxiosError('Bad option', 'ERR_BAD_OPTION_VALUE');
    vi.spyOn(api, 'get').mockRejectedValue(error);
    await expect(service.getProducts()).rejects.toBe(error);
  });

  it.each(['', 'abc', '0', '-1', '1.2', '1e2', '9007199254740992'])('rechaza ID inválido %s sin consultar la API', async (id) => {
    const get = vi.spyOn(api, 'get');
    await expect(service.getProduct(id)).rejects.toBeInstanceOf(ProductNotFoundError);
    expect(get).not.toHaveBeenCalled();
  });

  it('consulta el detalle por ID y conserva su origen real', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: MOCK_PRODUCTS[0] });
    expect(await service.getProduct('1')).toEqual({ product: MOCK_PRODUCTS[0], source: 'api' });
    expect(get).toHaveBeenCalledWith('/products/1');
  });

  it('muestra no encontrado ante 404 aunque el producto exista en respaldo', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(Object.assign(new AxiosError('Not found'), { response: { status: 404 } }));
    await expect(service.getProduct(1)).rejects.toBeInstanceOf(ProductNotFoundError);
  });

  it('ofrece un detalle local sólo para IDs presentes en el respaldo', async () => {
    const error = new AxiosError('timeout', 'ECONNABORTED');
    vi.spyOn(api, 'get').mockRejectedValue(error);
    expect((await service.getProduct('1')).source).toBe('local');
    await expect(service.getProduct('100')).rejects.toBe(error);
  });

  it('busca por nombre, categoría y marca, tolerando marca ausente', () => {
    const products = [{ ...MOCK_PRODUCTS[0], brand: undefined }, MOCK_PRODUCTS[5]];
    expect(filterProducts(products, ' MASCARA ')).toEqual([products[0]]);
    expect(filterProducts(products, 'fragrances')).toEqual([products[1]]);
    expect(filterProducts(products, 'CALVIN')).toEqual([products[1]]);
    expect(filterProducts(products, '')).toEqual(products);
    expect(filterProducts(products, 'sin coincidencias')).toEqual([]);
  });

  it('consulta inventario persistido sin transformar la respuesta de productos', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { products: [MOCK_PRODUCTS[0]], total: 1, skip: 0, limit: 1 } });
    expect(await service.getInventory()).toEqual([MOCK_PRODUCTS[0]]);
    expect(get).toHaveBeenCalledWith('/products', { params: { limit: 0 } });
  });

  it.each(['ERR_NETWORK', 'ECONNABORTED'])('no utiliza respaldo de demostración al gestionar inventario ante %s', async (code) => {
    const error = new AxiosError('No connection', code);
    vi.spyOn(api, 'get').mockRejectedValue(error);
    await expect(service.getInventory()).rejects.toBe(error);
  });

  it('no utiliza respaldo al gestionar inventario cuando el servidor devuelve 503', async () => {
    const error = Object.assign(new AxiosError('Unavailable'), { response: { status: 503 } });
    vi.spyOn(api, 'get').mockRejectedValue(error);
    await expect(service.getInventory()).rejects.toBe(error);
  });

  const input: ProductInput = { title: 'Cuaderno', description: 'Cuaderno de notas', category: 'Papelería', price: 14.5, stock: 8 };

  it('crea un producto enviando ProductInput y devuelve el ID asignado por la API', async () => {
    const saved = { ...input, id: 27 };
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: saved });
    expect(await service.createProduct(input)).toEqual(saved);
    expect(post).toHaveBeenCalledWith('/products', input);
  });

  it('actualiza un producto existente mediante PUT', async () => {
    const saved = { ...input, id: 27, price: 19.95 };
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: saved });
    expect(await service.updateProduct(27, { ...input, price: 19.95 })).toEqual(saved);
    expect(put).toHaveBeenCalledWith('/products/27', { ...input, price: 19.95 });
  });

  it('elimina por ID y acepta una respuesta sin contenido', async () => {
    const remove = vi.spyOn(api, 'delete').mockResolvedValue({ status: 204 });
    await expect(service.deleteProduct(27)).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledWith('/products/27');
  });

  it('conserva los errores de validación y no simula creación exitosa', async () => {
    const error = Object.assign(new AxiosError('Validation failed'), { response: { status: 400, data: { message: 'Precio inválido', errors: { price: 'Fuera de rango' } } } });
    vi.spyOn(api, 'post').mockRejectedValue(error);
    await expect(service.createProduct({ ...input, price: -1 })).rejects.toBe(error);
  });

  it('no simula actualización ni eliminación cuando falla la conexión', async () => {
    const error = new AxiosError('Network error', 'ERR_NETWORK');
    vi.spyOn(api, 'put').mockRejectedValue(error);
    vi.spyOn(api, 'delete').mockRejectedValue(error);
    await expect(service.updateProduct(27, input)).rejects.toBe(error);
    await expect(service.deleteProduct(27)).rejects.toBe(error);
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rechaza ID inválido %s antes de editar o eliminar', async (id) => {
    const put = vi.spyOn(api, 'put');
    const remove = vi.spyOn(api, 'delete');
    await expect(service.updateProduct(id, input)).rejects.toBeInstanceOf(ProductNotFoundError);
    await expect(service.deleteProduct(id)).rejects.toBeInstanceOf(ProductNotFoundError);
    expect(put).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});
