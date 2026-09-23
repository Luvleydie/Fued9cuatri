from pathlib import Path
from html import escape
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Preformatted
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Polygon

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/pdf/NovaCart_Guia.pdf'
OUT.parent.mkdir(parents=True, exist_ok=True)
fonts = Path('C:/Windows/Fonts')
pdfmetrics.registerFont(TTFont('Guide', str(fonts / 'arial.ttf')))
pdfmetrics.registerFont(TTFont('GuideBold', str(fonts / 'arialbd.ttf')))
pdfmetrics.registerFont(TTFont('Code', str(fonts / 'consola.ttf')))
pdfmetrics.registerFontFamily('Guide', normal='Guide', bold='GuideBold', italic='Guide', boldItalic='GuideBold')
purple = colors.HexColor('#6550bf')
dark = colors.HexColor('#2c2840')
pale = colors.HexColor('#f3f0fb')
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='BodyGuide', fontName='Guide', fontSize=10.2, leading=14.3, textColor=dark, spaceAfter=9))
styles.add(ParagraphStyle(name='TitleGuide', fontName='GuideBold', fontSize=24, leading=28, textColor=dark, spaceAfter=12))
styles.add(ParagraphStyle(name='HeadingGuide', fontName='GuideBold', fontSize=13, leading=17, textColor=purple, spaceBefore=8, spaceAfter=9))
styles.add(ParagraphStyle(name='TinyGuide', fontName='Guide', fontSize=8, leading=11, textColor=dark, spaceAfter=5))
styles.add(ParagraphStyle(name='CodeGuide', fontName='Code', fontSize=9, leading=12, backColor=pale, borderPadding=10, spaceBefore=5, spaceAfter=14))
story = []
def p(text, style='BodyGuide'):
    story.append(Paragraph(text, styles[style]))
def h(text):
    p(text, 'HeadingGuide')
def code(text):
    story.append(Preformatted(text, styles['CodeGuide']))
def table(rows, widths):
    cells = [[Paragraph(escape(str(cell)), styles['TinyGuide']) for cell in row] for row in rows]
    t = Table(cells, colWidths=widths, hAlign='LEFT')
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0),pale),('VALIGN',(0,0),(-1,-1),'TOP'),
        ('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),
        ('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),6),
        ('LINEBELOW',(0,0),(-1,0),.7,purple),('LINEBELOW',(0,1),(-1,-1),.4,colors.HexColor('#ddd7ed')),
    ]))
    story.append(t); story.append(Spacer(1,10))
def page(title, eyebrow):
    if story: story.append(PageBreak())
    p(eyebrow.upper(), 'TinyGuide')
    p(title, 'TitleGuide')
def diagram():
    d = Drawing(500, 194)
    boxes = [
        (8,113,'USERS',['id (PK), username (único)','nombre, apellido, email, password_hash']),
        (282,113,'PRODUCTS',['id (PK), title','price, stock']),
        (8,7,'SESSIONS',['token_hash (PK), user_id (FK)','expires_at']),
        (282,7,'CART_ITEMS',['user_id + product_id (PK y FK)','quantity']),
    ]
    for x,y,title,lines in boxes:
        d.add(Rect(x,y,212,70,rx=8,ry=8,fillColor=pale,strokeColor=colors.HexColor('#d7cdef')))
        d.add(String(x+12,y+49,title,fontName='GuideBold',fontSize=10,fillColor=purple))
        for i,line in enumerate(lines):
            d.add(String(x+12,y+31-i*14,line,fontName='Guide',fontSize=8,fillColor=dark))
    for x1,y1,x2,y2 in [(114,113,114,77),(388,113,388,77),(220,124,282,65)]:
        d.add(Line(x1,y1,x2,y2,strokeColor=purple,strokeWidth=1))
        d.add(String((x1+x2)/2+5,(y1+y2)/2,'1:N',fontName='GuideBold',fontSize=8,fillColor=purple))
    story.append(d)

page('NovaCart simplificado', 'Guía de implementación / 22 de septiembre de 2026')
p('Aplicación académica con <b>Angular/Ionic, TypeScript, Axios, PHP y MySQL de XAMPP</b>. El alcance se redujo a cuatro pantallas. La base utilizada es <b>novacart</b>, en el puerto <b>3306</b>.')
table([['Pantalla','Ruta','Función'],['Login','/login','Autenticar y abrir la página principal'],['Registro','/register','Crear una cuenta'],['Inicio','/home','CRUD de usuarios'],['Carrito','/cart','Agregar, consultar, modificar cantidad y quitar']], [92,79,328])
h('Cómo abrirla')
p('Activa Apache y MySQL en XAMPP y abre <b>http://localhost/novacart/</b>.<br/>Cuenta demo: <b>emilys / emilyspass</b>. Para preparar otra copia:')
code('npm ci\nnpm run db:setup\nnpm run deploy:xampp')
p('Para desarrollar con recarga automática: <b>npm run dev</b> y http://localhost:8100. La conexión PHP está en server/config.php; las tablas, en server/schema.sql.', 'TinyGuide')
h('Modelo de datos')
diagram()
p('Los usuarios y carritos permanecen en MySQL. La sesión de la pestaña usa sessionStorage. La base SQLite de la versión anterior ya no se utiliza.', 'TinyGuide')

page('Login: HTML, TypeScript y API', '02 / Autenticación')
p('<b>login.page.html</b> muestra los inputs. <b>login.page.ts</b> contiene el objeto tipado, el estado del formulario y la función asíncrona. Se conectan con ngModel y ngSubmit.')
code('credentials: LoginCredentials = {\n  username: \'\', password: \'\'\n};\n\n// HTML\n[(ngModel)]="credentials.username"\n(ngSubmit)="login()"')
h('Qué ocurre al pulsar Ingresar')
p('1. <b>async login(): Promise&lt;void&gt;</b> valida que haya usuario y contraseña. Promise&lt;void&gt; representa una operación asíncrona que no entrega un valor de retorno al formulario.')
p('2. Asigna <b>isSubmitting = true</b>. Los controles quedan desactivados para evitar solicitudes repetidas. Dentro de try, espera la respuesta de Axios:')
code("const { data } = await api.post<AuthResponse>(\n  '/auth/login', credentials\n);\nsaveSession(data);\nawait this.router.navigateByUrl('/home', {\n  replaceUrl: true\n});")
p('3. PHP consulta MySQL y verifica la contraseña. Si es correcta, genera un token temporal. Las contraseñas están almacenadas como hash Argon2id; en sessions se conserva el hash del token y su vencimiento.')
p('4. <b>saveSession</b> guarda el token, los datos públicos del usuario y expiresAt en sessionStorage. Router, inyectado por constructor, abre home. <b>replaceUrl</b> sustituye la entrada actual del historial.')
h('Errores, animación y temporizadores')
p('catch distingue errores HTTP con <b>axios.isAxiosError</b> y <b>AxiosError&lt;ApiError&gt;</b>. Si el login falla, limpia la sesión, muestra el mensaje y activa <b>failLogin</b>.')
p('El HTML aplica la animación. El arreglo <b>timer</b> conserva los identificadores de setTimeout: a los 500 ms termina la animación. Los temporizadores se cancelan al reintentar y destruir la página.')
p('finally asigna <b>isSubmitting = false</b>. Las credenciales incorrectas no abren home. La sesión dura una hora; al cerrar normalmente la pestaña y abrir otra se requiere login nuevamente.')

page('Interfaces, “setear” y carrito', '03 / Datos y operaciones')
p('<b>Setear significa asignar o establecer un valor.</b> Por ejemplo, <b>this.isSubmitting = true</b> asigna true a una variable. Asignar un valor en memoria no lo guarda automáticamente en la base.')
p('Una <b>interfaz TypeScript</b> describe los campos y tipos de un objeto. No crea objetos, no asigna datos ni persiste información por sí sola. La interfaz real está en src/app/models/cart-item.model.ts.')
code('export interface CartItem {\n  productId: number;\n  title: string;\n  price: number;\n  quantity: number;\n  stock: number;\n}\n\nitems: CartItem[] = []; // Empieza vacío.\n\nsetCart(cart: CartResponse): void {\n  this.items = cart.items; // Asigna el arreglo recibido.\n  this.total = cart.total;\n}')
p('<b>CartResponse</b> contiene items: CartItem[] y total: number. Al pulsar Agregar o +/-, el componente espera <b>CartService.setQuantity(productId, quantity)</b>. Axios envía PUT /cart/:productId con la cantidad.')
p('PHP valida cantidad y stock, obtiene el precio de MySQL, guarda cart_items y devuelve el carrito actualizado. Entonces <b>setCart</b> asigna los valores al componente. Si falla, aparece el error y se conserva el estado anterior. Cada cuenta tiene su propio carrito.')
h('CRUD principal de usuarios')
p('Home declara <b>users: User[] = []</b>. Al iniciar, loadUsers(): Promise&lt;void&gt; espera UsersService.getUsers() y asigna el resultado. El servicio Angular concentra las solicitudes Axios.')
table([['Acción','Solicitud de UsersService'],['Consultar','GET /api/users'],['Crear','POST /api/users'],['Modificar','PUT /api/users/:id'],['Eliminar','DELETE /api/users/:id']], [100,399])
p('El username es único. Al editar, una contraseña vacía conserva la actual; cambiarla revoca las sesiones. El usuario activo no puede eliminarse. Esta práctica no tiene roles ni pagos.', 'TinyGuide')

page('MCP, comprobación y uso de IA', '04 / Conexión de Codex')
p('<b>MCP</b> es el protocolo que permite a Codex usar herramientas para consultar MySQL. La app funciona con su API PHP; el MCP es la conexión adicional para el asistente.')
code('App:   Angular -> Axios -> Apache/PHP -> MySQL\nCodex: MCP -> Node por stdio -> PHP/PDO -> MySQL')
h('Cómo se conectó')
p('Se instalaron <b>@modelcontextprotocol/sdk</b> y <b>zod</b> como dependencias de desarrollo. mcp/server.mjs registra herramientas y ejecuta server/inspect.php. Este archivo utiliza consultas fijas de lectura, sin aceptar SQL arbitrario.')
table([['Herramienta','Uso'],['describe_schema','Consultar tablas y columnas'],['list_users','Datos públicos de hasta 100 usuarios'],['list_products','Hasta 100 productos y precios'],['get_cart','Artículos de un usuario por ID']], [130,369])
p('La configuración del proyecto está en <b>.codex/config.toml</b>:')
code('[mcp_servers.novacart_mysql]\ncommand = "node"\nargs = ["mcp/server.mjs"]\ncwd = "C:/Fued3"\nenabled = true')
p('Se comprobó con <b>codex mcp get novacart_mysql</b>, <b>npm run test:mcp</b> y consultas reales desde Codex. Si se mueve la carpeta, hay que ajustar cwd. Para cargar cambios de configuración se vuelve a abrir el proyecto o se inicia otra sesión de Codex.')
p('Ejemplo: “Usa novacart_mysql para describir las tablas” o “Consulta el carrito del usuario con id 1”. El MCP no devuelve contraseñas ni tokens y no modifica datos.')
h('Pruebas y prompts')
p('Resultados: <b>33 pruebas de Angular, 23 comprobaciones API y 5 escenarios de navegador aprobados</b>; lint, compilación y MCP correctos. El video muestra el cierre real del navegador y la recuperación de usuarios y carrito.')
p('La IA ayudó a simplificar las pantallas, generar interfaces y servicios, conectar PHP/MySQL y revisar errores. Prompts principales: “3 o 4 pantallas”; “Axios, isSubmitting, timer, failLogin y sessionStorage”; “interfaz del carrito y explicar setear”; “novacart en XAMPP 3306”; “MCP para MySQL en Codex”.', 'TinyGuide')
p('Fuentes: <link href="https://developers.openai.com/codex/mcp" color="#6550bf">MCP en Codex</link>; <link href="https://ts.sdk.modelcontextprotocol.io/server" color="#6550bf">SDK MCP</link>; <link href="https://www.php.net/manual/en/pdo.prepare.php" color="#6550bf">PDO preparado</link>. Guía completa y prompts: docs/PROYECTO_SIMPLE.md.', 'TinyGuide')

def footer(canvas, doc):
    canvas.setStrokeColor(colors.HexColor('#ded8ed')); canvas.line(48,39,A4[0]-48,39)
    canvas.setFont('Guide',8); canvas.setFillColor(colors.HexColor('#777080'))
    canvas.drawString(48,26,'NovaCart | Angular/Ionic + PHP + MySQL + MCP')
    canvas.drawRightString(A4[0]-48,26,str(doc.page))
doc = SimpleDocTemplate(str(OUT), pagesize=A4, rightMargin=48, leftMargin=48, topMargin=43, bottomMargin=53, title='NovaCart - Guía de implementación', author='Proyecto NovaCart')
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUT)
