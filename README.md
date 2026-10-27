# BARBER LINDEROS — Plataforma SaaS de gestión de barbería

MVP funcional completo: backend (API REST + tiempo real) y frontend (3 roles) según
la memoria maestra del proyecto, más notificaciones reales, WhatsApp, fotos
antes/después, soporte de migración a Postgres y una tienda de productos con
pago en línea (Webpay Plus / Transbank).

## Estructura

```
barber-linderos/
  backend/           Node.js + Express + Socket.io + SQLite/Postgres
  frontend/          HTML + CSS + JS modular (sin build step)
  docker-compose.yml Postgres local para desarrollo/pruebas de la migración
  PROMPT_MAESTRO.md  Prompt para continuar el desarrollo en VS Code (web + app móvil)
```

## Arquitectura

- **Servidor web**: Express entrega la web, la API y Socket.io desde el mismo origen. Las
  sesiones se guardan en una cookie `HttpOnly` y los permisos se validan en el servidor.
- **Base de datos con doble driver**: `node:sqlite` (dev, sin compilación) o Postgres
  (`pg`, producción), intercambiables con la variable `DB_DRIVER`. Toda la capa de
  acceso a datos es asíncrona (`await db.prepare(sql).get/all/run(...)`) para que
  ambos motores compartan exactamente el mismo código de controllers.
- **Frontend**: HTML/CSS/JS modular, sin frameworks — un `assets/js/api.js` compartido
  maneja las llamadas a la API, la sesión y el botón de WhatsApp. Diseño premium
  (negro + dorado), scroll cinematográfico con `IntersectionObserver`, responsive real.
- **Roles**: admin, barbero, cliente — con permisos verificados en el backend
  (middleware `requireRole`), no solo ocultos en el frontend.

## Cómo correrlo (modo desarrollo, SQLite)

```bash
cd backend
npm install
npm run seed      # solo para una base de datos local nueva
npm start         # http://localhost:8080
```

Abre `http://localhost:8080/`. El servidor entrega también los recursos del
frontend, por lo que no es necesario levantar un servidor estático separado.

Rutas públicas: `/`, `/tienda`, `/producto`, `/ingresar`, `/registro`,
`/reservar` y `/politicas-de-servicio`. Las direcciones antiguas `.html` se
redirigen a las nuevas sin perder parámetros. Las páginas de administración,
barbero y reservas del cliente exigen una sesión válida también al abrir la URL.

### Seguridad y despliegue

La aplicación incorpora cabeceras de seguridad, CSP por página, protección CSRF
para peticiones que cambian datos, límites de intentos de autenticación,
validación de entradas y archivos, y autorización para fotos de clientes y
facturas. Ejecuta la verificación con:

```bash
cd backend
npm test
```

Antes de publicar, usa HTTPS en el dominio final, define `NODE_ENV=production`,
`SITE_ORIGIN=https://tu-dominio.cl` y un `JWT_SECRET` aleatorio de al menos 32
caracteres. El servidor rechaza la configuración de producción si no se cumplen
esas condiciones o si no se usa PostgreSQL. Ejecuta `npm run migrate:postgres`
en cada despliegue: las migraciones se registran en `schema_migrations` y no se
repiten. No publiques cuentas de demostración ni sus contraseñas:
elimínalas o reemplaza sus claves y configura las credenciales reales fuera de Git.

## Cómo correrlo con Postgres (producción)

```bash
docker compose up -d                      # levanta Postgres local en :5432
cd backend
cp .env.example .env                      # y setea DB_DRIVER=postgres + DATABASE_URL
npm install
npm run migrate:postgres                  # aplica backend/migrations/schema.postgres.sql
npm run seed                               # con DB_DRIVER=postgres en el .env
npm start
```

## Qué está implementado

- Sistema de reservas en tiempo real: bloqueo automático de horarios (transacción
  atómica), liberación instantánea al cancelar, disponibilidad calculada en vivo,
  propagado por Socket.io a todos los clientes viendo esa agenda.
- Autenticación JWT con 3 roles estrictamente separados (verificado en backend).
- Landing page premium, flujo de reserva <60s, dashboards de barbero y admin.
- Sistema de fidelización: puntos por visita, niveles Bronce/Plata/Oro/Black.
- **Notificaciones reales**: confirmación inmediata y recordatorios automáticos
  24h/2h antes (scheduler con `node-cron`, cada 15 min) por email (`nodemailer`,
  vía SMTP configurable). Sin credenciales SMTP configuradas, el sistema funciona
  en "modo simulado" (loguea y registra en la tabla `notifications`) para que todo
  el flujo se pueda probar sin cuenta de correo real.
- **WhatsApp**: botón flotante de click-to-chat (`wa.me`) con mensaje predefinido en
  todas las páginas orientadas a cliente. Servicio backend listo para WhatsApp
  Cloud API (Meta): apenas se configuren `WHATSAPP_CLOUD_API_TOKEN` y
  `WHATSAPP_CLOUD_PHONE_ID`, las confirmaciones y recordatorios también se envían
  por WhatsApp real; sin esas credenciales, queda simulado (igual que el email).
- **Fotos antes/después**: subida (multer) desde el panel del barbero por cliente,
  galería visible en el panel del barbero y en el historial del cliente.
- **Migración a Postgres**: adaptador `pg` con la misma interfaz que SQLite
  (`backend/config/adapters/postgres.adapter.js`), esquema equivalente en
  `backend/migrations/schema.postgres.sql`, script `npm run migrate:postgres` y
  `docker-compose.yml` para levantar Postgres local.
- **Tienda con pago en línea (Webpay Plus / Transbank)**: catálogo público con
  filtros/orden/paginación, carrito persistido en `localStorage`, checkout con
  pago real vía Webpay, y gestión de productos y pedidos desde el panel admin.
  Ver detalle más abajo.

## Verificación realizada

- Suite de humo end-to-end contra SQLite (motor por defecto): registro, login,
  disponibilidad, creación/cancelación/bloqueo de reservas, notificaciones
  simuladas por email y WhatsApp, subida y listado de fotos — todo probado con
  peticiones HTTP reales contra el servidor levantado.
- El adaptador Postgres se validó contra un motor Postgres en memoria (`pg-mem`,
  protocolo real) aplicando el esquema de `schema.postgres.sql` y ejecutando el
  flujo completo registro → barbero → servicios → login → reserva a través de los
  controllers reales del backend.
  **Caveat honesto**: `pg-mem` no implementa aislamiento transaccional real
  (`BEGIN`/`ROLLBACK` no revierten cambios), así que el *rollback* de la
  transacción de reservas (para evitar doble-booking) no pudo verificarse contra
  ese motor — el código sigue el patrón estándar de la librería `pg` (conexión
  dedicada + `BEGIN`/`COMMIT`/`ROLLBACK`), pero se recomienda una prueba de
  concurrencia contra un Postgres real (por ejemplo, con el `docker-compose.yml`
  incluido) antes de producción.
- **Tienda**: se probó de extremo a extremo contra el servidor real levantado:
  catálogo con filtros (disponibilidad, precio) y los 8 órdenes de clasificación,
  paginación, validación de stock y de precios siempre server-side (rechaza
  cantidades mayores al stock, ignora precios manipulados desde el navegador),
  control de roles (solo `cliente` puede comprar, `barbero` recibe 403), y CRUD
  completo de productos desde el admin (alta con foto, edición de precio/stock,
  desactivar — desaparece del catálogo público pero sigue visible para el admin).
  También se confirmó que el stock **no** se descuenta si el pago no se aprueba
  (transacción atómica). Ver el caveat sobre Transbank en la sección de la tienda.

## Variables de entorno nuevas (ver `.env.example`)

`NODE_ENV`, `SITE_ORIGIN`, `TRUST_PROXY_HOPS`, `JWT_SECRET`, `DB_DRIVER`, `DATABASE_URL`, `PG_SSL`, `SMTP_HOST/PORT/USER/PASS/FROM`,
`NOTIFICATIONS_ENABLED`, `WHATSAPP_BUSINESS_NUMBER`, `WHATSAPP_CLOUD_API_TOKEN`,
`WHATSAPP_CLOUD_PHONE_ID`, `UPLOADS_DIR`, `MAX_UPLOAD_MB`, `TBK_ENVIRONMENT`,
`TBK_COMMERCE_CODE`, `TBK_API_KEY`, `BACKEND_PUBLIC_URL`.

## Tienda: catálogo, carrito y pago con Webpay Plus (Transbank)

Se agregó una tienda de productos de barbería (aceites, ceras, kits, gift cards)
con catálogo público, carrito y **pago real en línea** vía Webpay Plus.

- **Catálogo público** (`frontend/productos.html`): filtros por disponibilidad
  (en existencia / agotado) y rango de precio, orden (relevancia, más vendidos,
  alfabético, precio, fecha), paginación. Datos desde `GET /api/products`.
- **Carrito** (`frontend/assets/js/cart.js`): persistido en `localStorage`, icono
  flotante + drawer, disponible en cualquier página que no tenga `data-no-cart`
  en el `<body>` (ya incluido en `index.html` y `productos.html`).
- **Checkout**: el botón "Pagar con Webpay" crea la orden en el backend
  (`POST /api/orders`, con precios y stock **siempre validados server-side**,
  nunca confiando en lo que mande el navegador) y redirige al usuario al
  formulario de pago hospedado por Transbank.
- **Administración** (`frontend/admin/dashboard.html`, pestañas "🛍️ Tienda" y
  "💳 Pedidos"): alta de productos con foto, edición de precio/stock, activar/
  desactivar, y listado de todos los pedidos con su estado en tiempo real
  (Socket.io emite `order:paid` / `order:failed`).

### Ambiente de integración (por defecto, sin costo ni cuenta propia)

Por defecto (`TBK_ENVIRONMENT=integration`) el backend usa el código de comercio
y API key **públicos** que Transbank documenta oficialmente para desarrollo
(`transbank-sdk`, `IntegrationCommerceCodes.WEBPAY_PLUS` /
`IntegrationApiKeys.WEBPAY`). No es dinero real y no requiere que abras una
cuenta de comercio — sirve para probar el flujo completo tal cual quedaría en
producción.

**Tarjeta de prueba (ambiente de integración, publicada por Transbank):**

| Campo | Valor |
|---|---|
| Tarjeta VISA (pago aprobado) | 4051 8856 0044 6623 |
| Vencimiento | Cualquier fecha futura |
| CVV | 123 |
| RUT (pantalla del banco simulado) | 11.111.111-1 |
| Clave (pantalla del banco simulado) | 123 |

Estos datos son públicos y pueden cambiar; si no funcionan, revisa la sección
"Ambiente de Integración" en https://www.transbankdevelopers.cl para la versión
vigente.

### Pasar a cobrar con dinero real (producción)

1. Crea tu cuenta de comercio en https://www.transbankdevelopers.cl y obtén tu
   `commerceCode` y `apiKey` reales.
2. En `.env`: `TBK_ENVIRONMENT=production`, `TBK_COMMERCE_CODE=...`,
   `TBK_API_KEY=...`, y `BACKEND_PUBLIC_URL=https://tu-dominio-real.cl` (debe
   ser accesible por internet, porque Transbank redirige el pago de vuelta a
   `BACKEND_PUBLIC_URL + /api/orders/webpay/return`).
3. Nada más cambia: el mismo código de `services/webpay.service.js` sirve para
   ambos ambientes.

### Caveat honesto sobre esta verificación

Se probó de extremo a extremo en este entorno de desarrollo: catálogo con
filtros/orden/paginación, validación de stock y de precios en el backend,
creación de la orden, control de roles (solo `cliente` puede comprar), CRUD de
productos desde el admin (alta con foto, edición de precio/stock,
activar/desactivar y que desaparezca del catálogo público al desactivarse), y
que el stock **no** se descuenta si el pago falla (transacción atómica).
Lo único que **no** se pudo probar en este entorno es la ida y vuelta real
contra los servidores de Transbank (`webpay3gint.transbank.cl`), porque este
sandbox de desarrollo no tiene salida a internet hacia ese dominio (la llamada
falla con un error de red, que el backend captura de forma controlada: marca
la orden como `failed` y responde un error claro, sin caerse). El flujo
completo — clic en "Pagar con Webpay", pantalla real de Transbank, tarjeta de
prueba, vuelta a la tienda con el resultado — debe verificarse en tu máquina
real (con internet normal), no quedó confirmado desde acá.

## Siguientes pasos sugeridos

- Ver `PROMPT_MAESTRO.md` para continuar el desarrollo en VS Code / Claude Code:
  pulido del frontend web y arranque de la app móvil (React Native).
- Probar la migración a Postgres contra una instancia real antes de producción
  (el `docker-compose.yml` deja esto a un comando de distancia).
- Verificar el flujo real de Webpay en tu máquina (con internet) usando la
  tarjeta de prueba de la sección de la tienda, antes de pasar a producción.
- SMS como tercer canal de notificación (la tabla `notifications` ya soporta
  `channel = 'sms'`, solo falta el proveedor).

## Nota técnica

En modo SQLite (dev) se usa el módulo nativo `node:sqlite` (incluido desde
Node.js 22.5+) en lugar de `better-sqlite3`, para evitar compilación nativa.
Requiere Node >= 22.5. Verás una advertencia experimental de Node al iniciar —
es esperada y no afecta el funcionamiento. En modo Postgres se usa `pg` (driver
puro JS, sin compilación).
