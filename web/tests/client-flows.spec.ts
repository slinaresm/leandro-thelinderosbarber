import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), mysql = require('../../node_modules/mysql2/promise');
const fixture = JSON.parse(fs.readFileSync(process.env.WEB_TEST_CONTEXT!, 'utf8'));
const root = path.resolve('..'), credentials = JSON.parse(fs.readFileSync(process.env.MYSQL_CONNECTION_FILE || path.join(root, '.refactor-data/runtime/'+(process.env.RF_SQL_ENGINE||'mysql')+'.connection.json'), 'utf8'));
if (!/^rf015_test_[a-f0-9]+$/.test(fixture.database)) throw new Error('Usar web:client-test con MySQL aislado.');
async function sql(query: string, args: unknown[] = []) {
  const db = await mysql.createConnection({ ...credentials, database: fixture.database });
  try { return (await db.execute(query, args))[0]; } finally { await db.end(); }
}
async function login(page: Page, role = 'cliente') {
  await page.goto('/ingresar'); await page.getByLabel('Email', { exact: true }).fill(fixture.actors[role].email);
  await page.getByLabel('Contraseña', { exact: true }).fill(fixture.password); await page.getByRole('button', { name: 'Entrar a mi cuenta' }).click();
  await expect(page.getByTestId('identity')).toBeVisible();
}
async function api(context: BrowserContext, endpoint: string, body: object, method = 'POST') {
  const csrf = await (await context.request.get('/api/auth/csrf')).json();
  return context.request.fetch('/api' + endpoint, { method, data: body, headers: { 'X-CSRF-Token': csrf.csrfToken } });
}
async function booking(page: Page, date: string, time = '09:00') {
  await page.goto('/reservar?' + new URLSearchParams({ serviceId: 'rf014-service', barberId: fixture.actors.barbero.profile, date, startTime: time }));
  await expect(page.getByRole('combobox', { name: 'Horario', exact: true })).toHaveValue(time);
}
async function seedCart(page: Page, items: unknown = [{ productId: 'pomada', quantity: 2 }]) {
  await page.goto('/carrito'); await page.evaluate(items => localStorage.setItem('bl_cart', JSON.stringify(items)), items); await page.reload();
  await expect(page.getByTestId('cart-line')).toHaveCount(Array.isArray(items) ? 1 : 0);
}
async function review(page: Page) { await page.getByRole('button', { name: 'Revisar precio y stock' }).click(); await expect(page.getByText('Total revisado:', { exact: false })).toBeVisible(); }
async function resetCatalog() {
  await sql('UPDATE products SET price=CASE id WHEN ? THEN 10000 WHEN ? THEN 15000 WHEN ? THEN 2500 ELSE 0 END, stock=CASE id WHEN ? THEN 5 WHEN ? THEN 2 WHEN ? THEN 10 ELSE 0 END', ['pomada', 'aceite', 'peine', 'pomada', 'aceite', 'peine']);
  await sql('UPDATE services SET name=?,price=10000,duration_minutes=45,active=1 WHERE id=?', ['Corte de cabello', 'rf014-service']);
}
test.beforeEach(async ({ page }) => {
  await sql('DELETE FROM cache');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(message.text()); });
  await page.route('https://**/*', route => route.abort());
  (page as Page & { scriptErrors: string[] }).scriptErrors = errors;
});
test.afterEach(async ({ page }) => expect((page as Page & { scriptErrors: string[] }).scriptErrors).toEqual([]));

test('perfil propio real y matriz de permisos sin cambiar fidelización', async ({ page, browser }) => {
  const anonymous = await browser.newContext({ baseURL: fixture.url });
  expect((await anonymous.request.get('/api/clients/me/profile')).status()).toBe(401); await anonymous.close();
  await login(page);
  const own = await (await page.request.get('/api/clients/me/profile')).json();
  expect(own.client.id).toBe(fixture.actors.cliente.profile); expect(own.client.loyalty_points).toBe(180);
  expect((await page.request.get('/api/clients/me/profile?clientId=' + fixture.actors.cliente2.profile)).status()).toBe(400);
  expect((await page.request.get('/api/clients/' + fixture.actors.cliente2.profile)).status()).toBe(403);
  expect((await sql('SELECT loyalty_points FROM clients WHERE id=?', [fixture.actors.cliente.profile]))[0].loyalty_points).toBe(180);
  for (const role of ['admin', 'barbero']) {
    const context = await browser.newContext({ baseURL: fixture.url }); const other = await context.newPage(); await login(other, role);
    expect((await context.request.get('/api/clients/me/profile')).status()).toBe(403); await context.close();
  }
});

test('dos clientes compiten por el mismo intervalo en conexiones independientes', async ({ page, browser }) => {
  await resetCatalog(); await login(page);
  const context = await browser.newContext({ baseURL: fixture.url, reducedMotion: 'reduce' }); const peer = await context.newPage();
  const barrier = await mysql.createConnection({ ...credentials, database: fixture.database });
  try {
    await login(peer, 'cliente2'); await booking(page, '2099-06-01'); await booking(peer, '2099-06-01');
    await barrier.beginTransaction(); await barrier.execute('SELECT id FROM barbers WHERE id=? FOR UPDATE', [fixture.actors.barbero.profile]);
    const a = page.waitForResponse(response => response.url().endsWith('/api/reservations') && response.request().method() === 'POST');
    const b = peer.waitForResponse(response => response.url().endsWith('/api/reservations') && response.request().method() === 'POST');
    await Promise.all([page.getByRole('button', { name: 'Confirmar reserva', exact: true }).click(), peer.getByRole('button', { name: 'Confirmar reserva', exact: true }).click()]);
    await expect.poll(async () => (await sql("SELECT ID FROM information_schema.PROCESSLIST WHERE DB=? AND ID<>CONNECTION_ID() AND INFO LIKE '%barbers%' AND INFO LIKE '%for update%'", [fixture.database])).length, { timeout: 10000 }).toBe(2);
    await barrier.commit();
    const responses = await Promise.all([a, b]); expect(responses.map(response => response.status()).sort()).toEqual([201, 409]);
    const winner = responses[0].status() === 201 ? page : peer, loser = winner === page ? peer : page;
    await expect(winner.getByRole('heading', { name: 'Reserva confirmada', exact: true })).toBeVisible();
    await expect(loser.getByRole('alert')).toContainText('ocupado');
    await expect(loser.getByRole('combobox', { name: 'Horario', exact: true }).locator('option[value="09:00"]')).toHaveCount(0);
    expect((await sql('SELECT COUNT(*) n FROM reservations WHERE date=?', ['2099-06-01']))[0].n).toBe(1);
  } finally { await barrier.rollback(); await barrier.end(); await context.close(); }
});

test('otra página ocupa y libera horario con actualización en cinco segundos', async ({ page, browser }) => {
  await login(page); const context = await browser.newContext({ baseURL: fixture.url }); const peer = await context.newPage();
  try {
    await login(peer, 'cliente2'); await booking(page, '2099-06-02'); await booking(peer, '2099-06-02');
    await peer.getByRole('button', { name: 'Confirmar reserva', exact: true }).click(); await expect(peer.getByRole('heading', { name: 'Reserva confirmada' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Horario', exact: true }).locator('option[value="09:00"]')).toHaveCount(0, { timeout: 5000 });
    const [{ id }] = await sql('SELECT id FROM reservations WHERE date=? AND client_id=?', ['2099-06-02', fixture.actors.cliente2.profile]);
    expect((await api(context, '/reservations/' + id + '/cancel', {}, 'PATCH')).status()).toBe(200);
    await expect(page.getByRole('combobox', { name: 'Horario', exact: true }).locator('option[value="09:00"]')).toHaveCount(1, { timeout: 5000 });
  } finally { await context.close(); }
});

test('reprogramación conflictiva preserva origen, snapshots y cancelación confirmada', async ({ page }) => {
  await resetCatalog(); await login(page); await booking(page, '2099-06-03'); await page.getByRole('button', { name: 'Confirmar reserva', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Reserva confirmada' })).toBeVisible();
  const [{ id }] = await sql('SELECT id FROM reservations WHERE date=?', ['2099-06-03']);
  await sql('UPDATE services SET name=?,price=22000,duration_minutes=90 WHERE id=?', ['Servicio editado', 'rf014-service']);
  // Otra reserva del mismo cliente ocupa el destino; el servidor decide el conflicto.
  expect((await api(page.context(), '/reservations', { serviceId: 'rf014-service', barberId: fixture.actors.barbero.profile, date: '2099-06-04', startTime: '09:00' })).status()).toBe(201);
  await page.goto('/mi-cuenta/reservas');
  let card = page.getByTestId('visit').filter({ hasText: '2099-06-03' }); await expect(card).toContainText('$10.000'); await expect(card).toContainText('45 minutos');
  await card.getByRole('button', { name: 'Reprogramar', exact: true }).click(); await card.getByLabel('Nueva fecha').fill('2099-06-04'); await card.getByRole('button', { name: 'Guardar nuevo horario' }).click();
  await expect(card).toContainText('Tu reserva original no se modifica');
  expect((await sql('SELECT date,start_time,service_price_snapshot FROM reservations WHERE id=?', [id]))[0].start_time).toBe('09:00:00');
  await card.getByLabel('Nueva fecha').fill('2099-06-05'); await card.getByRole('button', { name: 'Guardar nuevo horario' }).click();
  card = page.getByTestId('visit').filter({ hasText: '2099-06-05' }); await expect(card).toContainText('Reserva reprogramada.'); await expect(card).toContainText('$10.000');
  await card.getByRole('button', { name: 'Cancelar reserva', exact: true }).click(); await card.getByRole('button', { name: 'Confirmar cancelación' }).click(); await expect(card).toContainText('Cancelada');
  expect((await sql('SELECT status FROM reservations WHERE id=?', [id]))[0].status).toBe('cancelled'); await resetCatalog();
});

test('historial y fotos propios no revelan archivos ni notas de otro cliente', async ({ page, browser }) => {
  await login(page); await page.goto('/mi-cuenta/reservas?clientId=' + fixture.actors.cliente2.profile);
  await expect(page.getByRole('region', { name: 'Fidelización' })).toContainText('180 puntos');
  expect((await page.request.get('/uploads/haircuts/rf015-cliente.png')).status()).toBe(200);
  await expect(page.locator('.client-photo img')).toHaveCount(1); await expect(page.locator('.client-photo img')).toHaveJSProperty('naturalWidth', 480);
  expect((await page.request.get('/uploads/haircuts/rf015-cliente.png')).status()).toBe(200);
  expect((await page.request.get('/uploads/haircuts/rf015-cliente2.png')).status()).toBe(404);
  expect((await page.request.get('/api/photos?clientId=' + fixture.actors.cliente2.profile)).status()).toBe(403);
  expect((await page.request.get('/api/notes')).status()).toBe(403);
  const anonymous = await browser.newContext({ baseURL: fixture.url }); expect((await anonymous.request.get('/uploads/haircuts/rf015-cliente.png')).status()).toBe(401); await anonymous.close();
});

test('sesión revocada retira historial y fotos privados', async ({ page }) => {
  await login(page); await page.goto('/mi-cuenta/reservas'); await expect(page.locator('.client-photo img')).toHaveCount(1);
  await sql('UPDATE jwt_sessions SET revoked_at=UTC_TIMESTAMP() WHERE user_id=?', [fixture.actors.cliente.id]);
  await expect(page).toHaveURL(/\/ingresar\?returnTo=/, { timeout: 5000 }); await expect(page.locator('.client-photo img')).toHaveCount(0);
});

test('respuestas antiguas no reemplazan la disponibilidad de otra fecha', async ({ page }) => {
  let release!: () => void, ready!: () => void; const held = new Promise<void>(resolve => { release = resolve; }), first = new Promise<void>(resolve => { ready = resolve; });
  await page.route('**/api/reservations/availability?*', async route => { if (route.request().url().includes('2099-06-06')) { ready(); await held; await route.fulfill({ json: { availableSlots: ['00:00'] } }); } else await route.continue(); });
  await page.goto('/reservar?' + new URLSearchParams({ serviceId: 'rf014-service', barberId: fixture.actors.barbero.profile, date: '2099-06-06' })); await first;
  await page.getByLabel('Fecha', { exact: true }).fill('2099-06-07'); await expect(page.getByRole('combobox', { name: 'Horario', exact: true }).locator('option[value="09:00"]')).toHaveCount(1);
  release(); await page.getByRole('combobox', { name: 'Horario', exact: true }).selectOption('09:00'); await expect(page.getByRole('combobox', { name: 'Horario', exact: true }).locator('option[value="00:00"]')).toHaveCount(0);
});

test('catálogo restaura filtros, orden y paginación desde URL', async ({ page }) => {
  await resetCatalog(); await page.goto('/tienda?minPrice=0&maxPrice=10000&availability=in_stock&sort=precio_asc&pageSize=1');
  await expect(page.getByTestId('product')).toHaveCount(1); await expect(page.getByTestId('product')).toContainText('Peine clásico');
  await page.getByRole('button', { name: 'Página siguiente' }).click(); await expect(page.getByTestId('product')).toContainText('Pomada de la casa');
  await page.reload(); await expect(page.getByTestId('product')).toContainText('Pomada de la casa'); expect(new URL(page.url()).searchParams.get('minPrice')).toBe('0');
  await page.getByLabel('Precio mínimo').fill('12000'); await page.getByLabel('Precio máximo').fill('100'); await page.getByRole('button', { name: 'Aplicar filtros' }).click(); await expect(page.getByRole('alert')).toContainText('mínimo');
});

test('detalle antiguo y carrito sobreviven a recarga con datos mínimos', async ({ page }) => {
  await resetCatalog(); await page.goto('/producto.html?id=pomada'); await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pomada de la casa');
  await page.getByLabel('Cantidad de Pomada de la casa').fill('2'); await page.getByRole('button', { name: 'Agregar al carrito' }).click(); await page.goto('/carrito'); await page.reload();
  await expect(page.getByTestId('cart-line')).toHaveCount(1); expect(await page.evaluate(() => JSON.parse(localStorage.getItem('bl_cart')!))).toEqual([{ productId: 'pomada', quantity: 2 }]);
  await review(page); await expect(page.getByText('Total revisado:')).toContainText('$20.000');
});

test('carrito legado descarta precios, HTML y URLs manipulados', async ({ page }) => {
  await resetCatalog(); await seedCart(page, [{ productId: 'pomada', quantity: 2, price: 1, name: '<script>bad()</script>', image_url: 'https://evil.example/x' }, { productId: 'pomada', quantity: 1 }, { productId: 'aceite', quantity: -1 }]);
  await expect(page.getByLabel('Cantidad de pomada')).toHaveValue('3'); await review(page); await expect(page.getByTestId('cart-line')).toContainText('Pomada de la casa'); await expect(page.getByText('Total revisado:')).toContainText('$30.000');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('bl_cart')!))).toEqual([{ productId: 'pomada', quantity: 3 }]);
});

test('JSON corrupto y almacenamiento deshabilitado muestran recuperación', async ({ page }) => {
  await page.goto('/carrito'); await page.evaluate(() => localStorage.setItem('bl_cart', '{broken')); await page.reload(); await expect(page.getByRole('alert')).toContainText('recuperar');
  await page.context().addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage disabled', 'SecurityError'); } }));
  await page.goto('/producto?id=pomada'); await page.getByRole('button', { name: 'Agregar al carrito' }).click(); await page.getByRole('link', { name: 'Revisar carrito', exact: true }).click();
  await expect(page.getByTestId('cart-line')).toHaveCount(1); await expect(page.getByRole('alert')).toContainText('solo mientras');
});

test('cambio de precio exige nueva revisión y pedido usa snapshots de servidor', async ({ page }) => {
  await resetCatalog(); await login(page); await seedCart(page); await review(page); await sql('UPDATE products SET price=12000 WHERE id=?', ['pomada']);
  await page.getByRole('button', { name: 'Crear pedido manual' }).click(); await expect(page.getByRole('alert')).toContainText('cambió'); await expect(page.getByText('Total revisado:')).toContainText('$24.000');
  await page.getByRole('button', { name: 'Crear pedido manual' }).click(); await expect(page.getByRole('heading', { name: 'Pedido creado', exact: true })).toBeVisible(); await expect(page.getByRole('status').filter({ hasText: 'Pedido creado' })).toContainText('$24.000');
  await page.getByRole('link', { name: 'Consultar mi pedido' }).click(); await expect(page.getByTestId('order')).toContainText('Pendiente de pago'); await page.reload(); await expect(page.getByTestId('order')).toContainText('$24.000');
  expect((await sql('SELECT stock FROM products WHERE id=?', ['pomada']))[0].stock).toBe(5);
});

test('stock obsoleto no crea pedido ni borra el carrito', async ({ page }) => {
  await resetCatalog(); await login(page); await seedCart(page); await review(page); await sql('UPDATE products SET stock=1 WHERE id=?', ['pomada']);
  const [{ n: before }] = await sql('SELECT COUNT(*) n FROM orders'); await page.getByRole('button', { name: 'Crear pedido manual' }).click();
  await expect(page.getByTestId('cart-line').getByRole('alert')).toContainText('stock suficiente'); await expect(page.getByRole('button', { name: 'Crear pedido manual' })).toBeDisabled(); expect((await sql('SELECT COUNT(*) n FROM orders'))[0].n).toBe(before);
  await page.reload(); await expect(page.getByLabel('Cantidad de pomada')).toHaveValue('2');
});

test('cambio entre preflight y POST muestra el total real sin cobro', async ({ page }) => {
  await resetCatalog(); await login(page); await seedCart(page); await review(page);
  await page.route('**/api/orders', async route => { if (route.request().method() === 'POST') { await sql('UPDATE products SET price=13000 WHERE id=?', ['pomada']); } await route.continue(); });
  await page.getByRole('button', { name: 'Crear pedido manual' }).click(); await expect(page.getByRole('status').filter({ hasText: 'Pedido creado' })).toContainText('$26.000');
});

test('respuesta perdida conserva carrito y no repite pedido confirmado en servidor', async ({ page }) => {
  await resetCatalog(); await login(page); await seedCart(page); await review(page); let posts = 0;
  const [{ n: before }] = await sql('SELECT COUNT(*) n FROM orders');
  await page.route('**/api/orders', async route => { if (route.request().method() === 'POST') { posts++; const response = await route.fetch(); expect(response.status()).toBe(201); await route.abort(); } else await route.continue(); });
  await page.getByRole('button', { name: 'Crear pedido manual' }).click(); await expect(page.getByRole('alert')).toContainText('No conocemos el resultado'); await expect(page.getByRole('button', { name: 'Crear pedido manual' })).toBeDisabled();
  await expect(page.getByTestId('cart-line')).toHaveCount(1); expect(posts).toBe(1); expect((await sql('SELECT COUNT(*) n FROM orders'))[0].n).toBe(Number(before) + 1);
  await page.getByRole('link', { name: 'Mis pedidos', exact: true }).first().click(); await expect(page.getByTestId('order').first()).toBeVisible();
});

test('pedido propio se actualiza por evento y otro cliente no puede consultarlo', async ({ page, browser }) => {
  await resetCatalog(); await login(page); const response = await api(page.context(), '/orders', { items: [{ productId: 'aceite', quantity: 1 }] }); const { order } = await response.json();
  await page.goto('/mi-cuenta/pedidos?orderId=' + order.id); await expect(page.getByTestId('order')).toContainText('Pendiente de pago');
  const context = await browser.newContext({ baseURL: fixture.url }); const admin = await context.newPage();
  try {
    await login(admin, 'cliente2'); expect((await context.request.get('/api/orders/' + order.id)).status()).toBe(403);
    await admin.goto('/mi-cuenta/pedidos?orderId=' + order.id); await expect(admin.getByRole('alert')).toContainText('permiso'); await expect(admin.getByTestId('order')).toHaveCount(0);
    await admin.getByRole('button', { name: 'Cerrar sesión', exact: true }).click(); await expect(admin.getByRole('button', { name: 'Entrar a mi cuenta' })).toBeVisible(); await login(admin, 'admin');
    expect((await api(context, '/orders/' + order.id + '/status', { status: 'paid' }, 'PATCH')).status()).toBe(200);
    await expect(page.getByTestId('order')).toContainText('Pagado', { timeout: 5000 }); expect((await sql('SELECT stock FROM products WHERE id=?', ['aceite']))[0].stock).toBe(1);
  } finally { await context.close(); }
});

test('carrito sincroniza otra pestaña e invalida una revisión previa', async ({ page, context }) => {
  await resetCatalog(); await login(page); await seedCart(page); await review(page); const other = await context.newPage();
  try { await other.goto('/carrito'); await other.getByLabel('Cantidad de pomada').fill('3'); await expect(page.getByLabel('Cantidad de pomada')).toHaveValue('3'); await expect(page.getByRole('button', { name: 'Crear pedido manual' })).toBeDisabled(); }
  finally { await other.close(); }
});

test('móvil y teclado: formularios accesibles y capturas de todos los flujos', async ({ page }) => {
  await resetCatalog(); await login(page);
  expect((await api(page.context(), '/orders', { items: [{ productId: 'peine', quantity: 1 }] })).status()).toBe(201);
  await seedCart(page);
  await page.setViewportSize({ width: 390, height: 844 }); await booking(page, '2099-06-08');
  await page.getByRole('combobox', { name: 'Horario', exact: true }).focus(); await page.keyboard.press('ArrowDown'); await expect(page.getByRole('combobox', { name: 'Horario', exact: true })).toHaveValue('10:00'); await page.keyboard.press('Tab'); await expect(page.getByLabel('Notas para tu atención (opcional)')).toBeFocused();
  const folder = path.join(root, 'docs/refactor/evidencia/RF-015-visual'); fs.mkdirSync(folder, { recursive: true });
  for (const [label, width, height] of [['movil', 390, 844], ['escritorio', 1440, 1000]] as const) {
    await page.setViewportSize({ width, height });
    for (const [name, route] of [['reserva', '/reservar?serviceId=rf014-service&barberId=' + fixture.actors.barbero.profile + '&date=2099-06-08'], ['historial', '/mi-cuenta/reservas'], ['tienda', '/tienda'], ['producto', '/producto?id=pomada'], ['carrito', '/carrito'], ['pedidos', '/mi-cuenta/pedidos']]) {
      await page.goto(route); await expect(page.locator('main h1')).toBeVisible();
      if (name === 'historial') { await expect(page.locator('.client-photo img')).toHaveJSProperty('naturalWidth', 480); await expect(page.getByText('Cargando tu historial…', { exact: true })).toHaveCount(0); }
      if (name === 'reserva') { await page.getByRole('combobox', { name: 'Horario', exact: true }).selectOption('10:00'); await expect(page.getByRole('button', { name: 'Confirmar reserva', exact: true })).toBeEnabled(); }
      if (name === 'tienda') await expect(page.getByTestId('product')).toHaveCount(4);
      if (name === 'producto') await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pomada de la casa');
      if (name === 'carrito') { await page.getByRole('button', { name: 'Revisar precio y stock' }).click(); await expect(page.getByText('Total revisado:')).toBeVisible(); }
      if (name === 'pedidos') await expect(page.getByTestId('order').first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: path.join(folder, name + '-' + label + '.png'), fullPage: true });
    }
  }
});

test('respuesta privada antigua no invalida una nueva cuenta', async ({ page }) => {
  await login(page); await expect(page.locator('.client-photo img')).toHaveCount(1);
  let release!: () => void, ready!: () => void, count = 0;
  const held = new Promise<void>(resolve => { release = resolve; }), first = new Promise<void>(resolve => { ready = resolve; });
  await page.route('**/api/photos', async route => { if (++count === 1) { ready(); await held; await route.fulfill({ status: 401, json: { error: 'No autorizado.' } }); } else await route.continue(); });
  await page.getByRole('button', { name: 'Actualizar historial' }).click(); await first;
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(fixture.actors.cliente2.email); await page.getByLabel('Contraseña', { exact: true }).fill(fixture.password); await page.getByRole('button', { name: 'Entrar a mi cuenta' }).click();
  await expect(page.locator('.client-photo img')).toHaveAttribute('src', '/uploads/haircuts/rf015-cliente2.png');
  const old = page.waitForResponse(response => response.url().endsWith('/api/photos') && response.status() === 401);
  release(); await old;
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.locator('.client-photo img')).toHaveAttribute('src', '/uploads/haircuts/rf015-cliente2.png');
  expect((await (await page.request.get('/api/clients/me/profile')).json()).client.id).toBe(fixture.actors.cliente2.profile);
});

test('respaldo HTTP mantiene la agenda cuando SSE no está disponible', async ({ page, browser }) => {
  await resetCatalog(); await login(page); let polls = 0;
  await page.route('**/api/events/stream?*', route => route.fulfill({ status: 503 }));
  page.on('request', request => { if (request.url().includes('/api/events?')) polls++; });
  await booking(page, '2099-06-09');
  const context = await browser.newContext({ baseURL: fixture.url }); const peer = await context.newPage();
  try {
    await login(peer, 'cliente2'); expect((await api(context, '/reservations', { serviceId: 'rf014-service', barberId: fixture.actors.barbero.profile, date: '2099-06-09', startTime: '09:00' })).status()).toBe(201);
    await expect(page.getByRole('combobox', { name: 'Horario', exact: true }).locator('option[value="09:00"]')).toHaveCount(0, { timeout: 5000 }); expect(polls).toBeGreaterThan(0);
  } finally { await context.close(); }
});

test('conflicto de stock posterior al preflight conserva carrito sin pedido falso', async ({ page }) => {
  await resetCatalog(); await login(page); await seedCart(page); await review(page);
  const [{ n: before }] = await sql('SELECT COUNT(*) n FROM orders');
  await page.route('**/api/orders', async route => { if (route.request().method() === 'POST') await sql('UPDATE products SET stock=0 WHERE id=?', ['pomada']); await route.continue(); });
  await page.getByRole('button', { name: 'Crear pedido manual' }).click(); await expect(page.getByRole('alert')).toContainText('Cambió la disponibilidad');
  await expect(page.getByRole('heading', { name: 'Pedido creado', exact: true })).toHaveCount(0); await expect(page.getByTestId('cart-line')).toHaveCount(1); expect((await sql('SELECT COUNT(*) n FROM orders'))[0].n).toBe(before);
});

test('reserva con respuesta perdida se comprueba en historial antes de repetir', async ({ page }) => {
  await resetCatalog(); await login(page); await booking(page, '2099-06-10'); let posts = 0;
  await page.route('**/api/reservations', async route => { if (route.request().method() === 'POST') { posts++; const response = await route.fetch(); expect(response.status()).toBe(201); await route.abort(); } else await route.continue(); });
  await page.getByRole('button', { name: 'Confirmar reserva', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('Revisa Mis reservas');
  await expect(page.getByRole('heading', { name: 'Reserva confirmada', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Mis reservas', exact: true }).click(); await expect(page.getByTestId('visit').filter({ hasText: '2099-06-10' })).toContainText('Confirmada'); expect(posts).toBe(1);
});

test('fidelización cambia por evento al completar la visita, sin doble crédito', async ({ page, browser }) => {
  await resetCatalog(); await login(page);
  const before = Number((await sql('SELECT loyalty_points FROM clients WHERE id=?', [fixture.actors.cliente.profile]))[0].loyalty_points);
  const { reservation } = await (await api(page.context(), '/reservations', { serviceId: 'rf014-service', barberId: fixture.actors.barbero.profile, date: '2099-06-11', startTime: '09:00' })).json();
  const context = await browser.newContext({ baseURL: fixture.url }); const admin = await context.newPage();
  try {
    await login(admin, 'admin'); expect((await api(context, '/reservations/' + reservation.id + '/complete', {}, 'PATCH')).status()).toBe(200);
    await expect(page.getByRole('region', { name: 'Fidelización' })).toContainText((before + 10) + ' puntos', { timeout: 5000 });
    expect((await api(context, '/reservations/' + reservation.id + '/complete', {}, 'PATCH')).status()).toBe(409);
    expect(Number((await sql('SELECT loyalty_points FROM clients WHERE id=?', [fixture.actors.cliente.profile]))[0].loyalty_points)).toBe(before + 10);
  } finally { await context.close(); }
});

test('fechas UTC de pedidos y fotos se muestran como día local de Santiago', async ({ page }) => {
  await resetCatalog(); await login(page);
  const { order } = await (await api(page.context(), '/orders', { items: [{ productId: 'peine', quantity: 1 }] })).json();
  await sql('UPDATE orders SET created_at=? WHERE id=?', ['2026-10-30 02:30:00', order.id]);
  await page.goto('/mi-cuenta/pedidos?orderId=' + order.id); await expect(page.getByTestId('order')).toContainText('2026-10-29'); await expect(page.getByTestId('order')).not.toContainText('2026-10-30');
  await sql('UPDATE haircut_photos SET created_at=? WHERE id=?', ['2026-10-30 02:30:00', 'photo-cliente']);
  await page.goto('/mi-cuenta/reservas'); await expect(page.locator('.client-photo figcaption')).toContainText('2026-10-29');
});

test('IDs históricos con puntuación y cliente llamado me siguen siendo consultables', async ({ page }) => {
  const productId = "sku~a!'()";
  await sql('INSERT INTO products (id,name,price,stock,active) VALUES (?,?,1000,1,1)', [productId, 'Producto <script>window.bad=1</script>']);
  await page.goto('/producto?id=' + encodeURIComponent(productId)); await expect(page.getByRole('heading', { level: 1 })).toHaveText('Producto <script>window.bad=1</script>');
  expect(await page.evaluate(() => 'bad' in window)).toBe(false);
  await sql('INSERT INTO users (id,name,email,password_hash,role) VALUES (?,?,?,?,?)', ['legacy-me-user', 'Perfil histórico', 'legacy-me@example.test', 'not-a-login-hash', 'cliente']);
  await sql('INSERT INTO clients (id,user_id) VALUES (?,?)', ['me', 'legacy-me-user']);
  await login(page, 'admin');
  const response = await page.request.get('/api/clients/me'); expect(response.status()).toBe(200); expect((await response.json()).client.id).toBe('me');
});
