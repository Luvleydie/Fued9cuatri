import { afterEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, CanceledError } from 'axios';
import api from '../core/api/axios-client';
import { MOCK_PRODUCTS } from '../data/mock-products';
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
});
