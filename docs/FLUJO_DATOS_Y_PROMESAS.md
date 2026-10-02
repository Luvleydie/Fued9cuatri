# Setear, promesas y flujo de datos en NovaCart

Esta explicación corresponde a la versión previa con `ngModel`. Desde la actividad Data Driven los valores se gestionan con formularios reactivos; consulta [el flujo y código actuales](ACTIVIDAD_DATA_DRIVEN.md). Las explicaciones de promesas y las [peticiones HTTP](api/README.md) siguen siendo aplicables.

## 1. Setear significa asignar

“Setear” es una forma informal de decir **asignar o establecer un valor**. No es una instrucción especial de Angular.

```typescript
this.isSubmitting = true;     // Asigna true a una propiedad.
this.credentials.username = 'ana'; // Asigna un texto.
this.items = cart.items;       // Asigna un arreglo.
```

`this` se refiere a la instancia actual del componente; `=` es el operador de asignación. Lo de la derecha se evalúa y se coloca en la propiedad de la izquierda.

En [login.page.html](../src/app/pages/login/login.page.html), `[(ngModel)]="credentials.username"` también actualiza un valor: cuando escribes, Angular asigna el texto a la propiedad; si el componente cambia esa propiedad, el input refleja el cambio.

### Asignar y guardar son pasos diferentes

| Operación | Dónde queda el valor | ¿Se conserva al cerrar la app? |
|---|---|---|
| `this.items = cart.items` | Memoria del componente | No por sí misma |
| `sessionStorage.setItem(...)` | Almacenamiento de la pestaña | Normalmente termina al cerrar la pestaña |
| Axios -> PHP -> INSERT/UPDATE | MySQL, base novacart | Sí |

En el carrito, `setCart()` actualiza la pantalla. `CartService.setQuantity()` envía una solicitud para guardar la cantidad en MySQL. Aunque ambos nombres empiezan por “set”, hacen trabajos distintos.

## 2. Qué hace una interfaz

Una interfaz describe **la forma que debe tener un objeto**. TypeScript utiliza esa descripción para comprobar tipos durante el desarrollo. No crea el objeto ni asigna valores; tampoco valida por sí sola el JSON que llega por la red.

En [cart-item.model.ts](../src/app/models/cart-item.model.ts):

```typescript
export interface CartItem {
  productId: number;
  title: string;
  price: number;
  quantity: number;
  stock: number;
}

export interface CartResponse {
  items: CartItem[];
  total: number;
}
```

`CartItem[]` significa “arreglo de objetos CartItem”. Un objeto que cumple esa interfaz:

```typescript
const item: CartItem = {
  productId: 1,
  title: 'Mouse inalámbrico',
  price: 249,
  quantity: 1,
  stock: 20
};
item.quantity = 2; // Asignación local; aún no escribe en MySQL.
```

En [CartPage](../src/app/pages/cart/cart.page.ts) se utiliza así:

```typescript
items: CartItem[] = [];

setCart(cart: CartResponse): void {
  this.items = cart.items;
  this.total = cart.total;
}
```

- `CartResponse` indica qué campos tiene el parámetro.
- `cart` es el objeto recibido.
- `this.items = cart.items` es la asignación.
- `void` indica que setCart no devuelve un resultado útil.
- Esta función es inmediata, por eso no necesita una promesa.

## 3. Qué es una promesa

Una **Promise** representa el resultado de una operación que puede terminar más adelante. Tiene tres estados: pendiente, cumplida con un valor o rechazada con un error. [Referencia: Promise en MDN](https://developer.mozilla.org/es/docs/Web/JavaScript/Reference/Global_Objects/Promise).

Por ejemplo, al pedir el carrito, el navegador debe esperar a que PHP consulte MySQL y responda. Axios entrega una promesa durante esa espera.

```typescript
async getCart(): Promise<CartResponse> {
  const { data } = await api.get<CartResponse>('/cart');
  return data;
}
```

Este método está en [cart.service.ts](../src/app/services/cart.service.ts):

1. `async` hace que la función devuelva una promesa.
2. `Promise<CartResponse>` indica el tipo de dato que entregará si termina correctamente.
3. `api.get<CartResponse>()` inicia la petición HTTP. El tipo ayuda a TypeScript; no cambia el JSON del servidor.
4. `await` espera el resultado dentro de esa función, sin detener toda la interfaz.
5. `{ data }` extrae el cuerpo de la respuesta Axios.
6. `return data` entrega el carrito al código que espera este servicio.

Si la solicitud se rechaza, await lanza ese error en la función; si el servicio no lo captura, el rechazo llega al componente. [Referencia: await](https://developer.mozilla.org/es/docs/Web/JavaScript/Reference/Operators/await).

### Promesa frente a resultado

```typescript
const pendiente = this.cartService.getCart();
// pendiente: Promise<CartResponse>. La petición ya está iniciada.

const cart = await pendiente;
// cart: CartResponse. Ahora tenemos items y total.

this.setCart(cart);
// Asignamos los datos confirmados al componente.
```

No hay que envolver Axios en `new Promise(...)`: ya devuelve promesas.

### Dónde van las promesas en esta app

| Método | Tipo de retorno | Motivo |
|---|---|---|
| login(), register() | Promise<void> | Esperan HTTP y navegación; actualizan el componente |
| loadUsers(), saveUser(), deleteUser() | Promise<void> | Esperan operaciones del servicio de usuarios |
| UsersService.getUsers() | Promise<User[]> | Entrega el listado cuando responde PHP |
| UsersService.createUser(), updateUser() | Promise<User> | Entregan el usuario guardado |
| UsersService.deleteUser() | Promise<void> | Espera la eliminación, sin datos de respuesta |
| CartService.getProducts() | Promise<Product[]> | Consulta productos |
| CartService.getCart(), setQuantity(), removeItem() | Promise<CartResponse> | Entregan el carrito confirmado por PHP |
| CartPage.loadCart(), setQuantity() | Promise<void> | Esperan servicios y actualizan la pantalla |
| setCart() | void | Solo asigna datos en memoria |
| quantityOf() | number | Busca una cantidad en un arreglo local |
| saveSession() | void | Escribe sessionStorage de forma síncrona |

`Promise<void>` sigue siendo una promesa que se puede esperar; simplemente no entrega datos al terminar. En los componentes, catch puede mostrar un error y terminar normalmente: que termine login() no significa por sí solo que las credenciales fueran correctas. El resultado se refleja en la navegación o en errorMessage.

### try, catch y finally

```typescript
this.isSubmitting = true;

try {
  const cart = await this.cartService.setQuantity(productId, quantity);
  this.setCart(cart);
} catch (error: unknown) {
  await this.handleError(error);
} finally {
  this.isSubmitting = false;
}
```

Este es el patrón usado en [CartPage.setQuantity](../src/app/pages/cart/cart.page.ts). El método completo también permite quitar un artículo cuando quantity vale 0.

- **try:** intenta completar la solicitud y aplicar la respuesta.
- **catch:** trata el error si falla la solicitud.
- **finally:** restablece el botón tanto después del éxito como del error.

`AxiosError<ApiError>` describe un error HTTP de Axios; `axios.isAxiosError` permite reconocerlo antes de leer `response?.data?.message`. Puede no existir response si no se recibió respuesta del servidor.

### Cuándo usar Promise.all

Al entrar al carrito, se necesitan productos y carrito. Son dos consultas independientes, por eso se inician juntas:

```typescript
const [products, cart] = await Promise.all([
  this.cartService.getProducts(),
  this.cartService.getCart()
]);
this.products = products;
this.setCart(cart);
```

Promise.all entrega ambos resultados en el mismo orden de entrada cuando las dos consultas terminan correctamente. Si una falla, rechaza la promesa conjunta; no cancela automáticamente la otra consulta. [Referencia: Promise.all](https://developer.mozilla.org/es/docs/Web/JavaScript/Reference/Global_Objects/Promise/all).

En el login hay dependencia: primero hay que esperar la autenticación, luego guardar la sesión y después navegar. Esos pasos se ejecutan en orden.

El timer de la animación usa `setTimeout`: devuelve un identificador que se guarda en el arreglo timer. No es una Promise, y no hace falta convertirlo en una para apagar failLogin a los 500 ms.

## 4. El recorrido completo de los datos

```mermaid
sequenceDiagram
    actor Persona
    participant HTML as Formulario HTML
    participant TS as Componente/servicio TS
    participant API as API PHP en Apache
    participant DB as MySQL novacart
    Persona->>HTML: Escribe datos y pulsa un botón
    HTML->>TS: ngModel asigna datos; ngSubmit llama al método
    TS->>API: Axios envía HTTP y JSON
    Note over TS: await espera la promesa
    API->>API: Valida campos y token, si corresponde
    API->>DB: PDO ejecuta SQL preparado
    DB-->>API: Resultado de consulta o escritura
    API-->>TS: Código HTTP y JSON
    TS->>TS: Asigna response.data a propiedades tipadas
    TS-->>HTML: Angular actualiza lo que se muestra
```

**El navegador nunca se conecta directamente al puerto 3306.** Envía HTTP a Apache. PHP utiliza PDO para conectarse a MySQL con [config.php](../server/config.php). phpMyAdmin es otra interfaz para administrar la misma base; no es un paso que tenga que atravesar Axios.

En Apache, la base de la API es `http://localhost/novacart/api`. En desarrollo, Angular usa `/api` y el proxy la dirige a Apache. El [cliente Axios](../src/app/core/api/axios-client.ts) comparte esa base y añade el token a los encabezados.

Las promesas descritas pertenecen a TypeScript/JavaScript. En esta API, PHP atiende cada petición y ejecuta las consultas PDO de forma síncrona antes de devolver el JSON.

## 5. Registro: qué pasa al crear una cuenta

**Archivos:** [HTML](../src/app/pages/register/register.page.html), [TypeScript](../src/app/pages/register/register.page.ts), [API register.php](../server/endpoints/register.php), [peticiones de ejemplo](api/register.http).

1. Escribes username, nombre, apellido, correo y contraseña. ngModel los asigna a `user: UserInput`.
2. ngSubmit llama a `register(): Promise<void>`; se activa isSubmitting.
3. `await api.post<User>('/auth/register', input)` envía el formulario como JSON.
4. register.php valida los datos y llama a createUser(), en database.php.
5. createUser() calcula el hash de la contraseña y ejecuta INSERT en users.
6. PHP devuelve **201** y los datos públicos del usuario, sin la contraseña.
7. La promesa de Axios se cumple. El componente muestra “Cuenta creada” y abre login.
8. Si el username ya existe, PHP devuelve **409** y catch muestra el error.

El registro crea una cuenta; en esta app todavía no inicia una sesión.

## 6. Login: cómo autentica y guarda la sesión

**Archivos:** [HTML](../src/app/pages/login/login.page.html), [TypeScript](../src/app/pages/login/login.page.ts), [API login.php](../server/endpoints/login.php), [peticiones de ejemplo](api/login.http).

1. ngModel asigna usuario y contraseña a `credentials: LoginCredentials`.
2. Se llama a `login(): Promise<void>`, que activa isSubmitting y espera:

```typescript
const { data } = await api.post<AuthResponse>('/auth/login', credentials);
saveSession(data);
const navigated = await this.router.navigateByUrl('/home', { replaceUrl: true });
```

3. login.php busca el username en users y verifica la contraseña contra password_hash.
4. Si es correcta, genera un token aleatorio. En sessions guarda su hash, el user_id y el vencimiento de una hora.
5. Devuelve **200** con los datos públicos, accessToken y expiresAt.
6. [saveSession](../src/app/core/api/session-storage.ts) guarda valores en sessionStorage. Para el objeto del usuario utiliza JSON.stringify; al leerlo utiliza JSON.parse.
7. El Router abre home y reemplaza la entrada actual del historial. Home carga los usuarios con otra petición.
8. Si hay credenciales incorrectas, llega **401**: se limpia la sesión y se muestra el error. failLogin activa una animación; timer permite cancelarla.
9. finally vuelve a asignar isSubmitting = false.

El [interceptor Axios](../src/app/core/api/axios-client.ts) añade `Authorization: Bearer <token>` a las siguientes peticiones. [auth.php](../server/auth.php) busca su hash en sessions y revisa que no haya vencido. El token identifica la cuenta; no se confía en un userId enviado por el navegador.

## 7. Carrito: ejemplo de cantidad 1 a cantidad 2

**Archivos:** [componente](../src/app/pages/cart/cart.page.ts), [servicio](../src/app/services/cart.service.ts), [API cart.php](../server/endpoints/cart.php), [peticiones de ejemplo](api/cart.http).

Supongamos que el producto 1 cuesta $249 y tiene una unidad en el carrito.

1. Pulsas **+**. El HTML llama a `setQuantity(1, 2)`.
2. El componente activa isSubmitting y espera el servicio.
3. El servicio envía `PUT /cart/1` con `{ "quantity": 2 }`.
4. PHP autentica el token, obtiene el user_id y valida que el producto exista y tenga stock suficiente.
5. Escribe la cantidad en cart_items. La clave combina user_id y product_id, por eso cada usuario tiene su propia fila.
6. PHP consulta los artículos y sus precios de products, calcula el total y responde:

```json
{
  "items": [
    { "productId": 1, "title": "Mouse inalámbrico", "price": 249, "stock": 20, "quantity": 2 }
  ],
  "total": 498
}
```

7. Axios recibe ese JSON; el servicio lo devuelve como CartResponse.
8. El componente ejecuta `setCart(cart)`: asigna items y total.
9. Angular muestra cantidad **2** y total **$498**. finally libera los botones.

Repetir PUT con quantity = 2 mantiene la cantidad en 2; el botón + calcula primero la nueva cantidad. Para quitar el artículo se envía DELETE. En ambos casos PHP devuelve el carrito resultante.

Si cierras la app, el arreglo en memoria desaparece, pero la fila de MySQL permanece. Después de iniciar sesión otra vez, GET /cart la recupera. Los precios proceden de la base; no se acepta un precio modificado en el navegador.

## 8. Dónde están las APIs ahora

```text
server/
  index.php             Decide qué endpoint ejecutar y maneja errores
  http.php              Respuestas JSON y métodos HTTP
  auth.php              Comprobación del token
  database.php          Conexión PDO y consultas compartidas
  validation.php        Validación del JSON
  endpoints/
    login.php           Autenticar
    register.php        Crear cuenta pública
    session.php         Consultar perfil y cerrar sesión
    users.php           CRUD de usuarios
    products.php        Consultar productos del carrito
    cart.php            Consultar, asignar cantidad y quitar
```

Las URLs siguen siendo /auth/login, /auth/register, /users, /products y /cart. No se utilizan las rutas de los archivos internos como URLs. index.php valida el acceso y luego llama a la función del archivo correspondiente.

En [docs/api](api/README.md) están la tabla de rutas, métodos, cuerpos, respuestas y cuatro archivos .http separados. Para actualizar Apache después de cambiar PHP, ejecuta `npm run api:deploy`.

## 9. Orden sugerido para estudiar el código

1. cart-item.model.ts: entiende la forma de los datos.
2. CartPage.setCart(): observa las asignaciones locales.
3. CartService.setQuantity(): sigue la promesa HTTP.
4. endpoints/cart.php: encuentra la escritura y la consulta a MySQL.
5. login.page.ts y endpoints/login.php: relaciona el token con el acceso al carrito.
6. register.page.ts y endpoints/register.php: sigue el alta de la cuenta.
7. docs/api/*.http: ejecuta cada petición y compara el JSON con las interfaces.

Pregunta usada para esta ampliación: “Explícame setear, login, register, carrito, promesas, el flujo con la base de datos y muéstrame las APIs en archivos aparte”.
