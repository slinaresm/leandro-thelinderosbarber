import { test, expect, type Page, type BrowserContext, type Locator } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), mysql = require('../../node_modules/mysql2/promise');
const fixture = JSON.parse(fs.readFileSync(process.env.WEB_TEST_CONTEXT!, 'utf8'));
const root = path.resolve('..'), credentials = JSON.parse(fs.readFileSync(process.env.MYSQL_CONNECTION_FILE || path.join(root, '.refactor-data/runtime/'+(process.env.RF_SQL_ENGINE||'mysql')+'.connection.json'), 'utf8'));
if (!/^rf016_test_[a-f0-9]+$/.test(fixture.database)) throw new Error('Usar web:staff-test con MySQL aislado.');
async function sql(query: string, args: unknown[] = []) { const db = await mysql.createConnection({ ...credentials, database: fixture.database }); try { return (await db.execute(query, args))[0]; } finally { await db.end(); } }
async function login(page: Page, actor = 'admin') { await page.context().clearCookies(); await page.goto('/ingresar'); await page.getByLabel('Email', { exact: true }).fill(fixture.actors[actor].email); await page.getByLabel('Contraseña', { exact: true }).fill(fixture.password); await page.getByRole('button', { name: 'Entrar a mi cuenta' }).click(); await expect(page.getByTestId('identity')).toBeVisible(); }
async function api(context: BrowserContext, endpoint: string, body: object = {}, method = 'POST', headers: Record<string, string> = {}) { const csrf = await (await context.request.get('/api/auth/csrf')).json(); return context.request.fetch('/api' + endpoint, { method, data: body, headers: { ...headers, 'X-CSRF-Token': csrf.csrfToken } }); }
async function tab(page: Page, name: string) { if (await page.locator('.staff-menu-toggle').isVisible()) await page.locator('.staff-menu-toggle').click(); await page.getByRole('navigation', { name: 'Secciones del panel' }).getByRole('link', { name, exact: true }).click(); await expect(page.getByRole('heading', { level: 2, name, exact: true })).toBeVisible(); }
async function selectClient(page: Page, actor: string) { await page.locator('.staff-client-row').filter({ hasText: fixture.actors[actor].email }).getByRole('button', { name: 'Ver ficha', exact: true }).click(); }
async function confirm(page: Page, scope: Page | Locator, label: string) { await scope.getByRole('button', { name: label, exact: true }).click(); const dialog = page.getByRole('dialog', { name: label, exact: true }); await expect(dialog).toBeVisible(); await dialog.getByRole('button', { name: label + ' definitivamente', exact: true }).click(); return dialog; }
async function formSave(form: Locator) { await form.getByRole('button', { name: 'Guardar', exact: true }).click(); if (await form.locator('dialog').count()) await form.getByRole('dialog', { name: 'Confirmar cambios' }).getByRole('button', { name: 'Confirmar cambios definitivamente' }).click(); }
const png = fs.readFileSync(path.join(path.dirname(process.env.WEB_TEST_CONTEXT!), 'photos/rf015-cliente.png'));
const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
test.beforeEach(async ({ page }) => {
  await sql('DELETE FROM cache');
  await sql("UPDATE services SET name='Corte de cabello',price=10000,duration_minutes=45,active=1 WHERE id='rf014-service'");
  await sql("UPDATE barbers SET active=1,work_start='09:00',work_end='22:00' WHERE id IN (?,?)", [fixture.actors.barbero.profile, fixture.actors.barbero2.profile]);
  await sql("UPDATE products SET price=10000,cost_price=5000,stock=5,active=1 WHERE id='pomada'");
  await sql("UPDATE inventory SET quantity=2,request_status='none',requested_by=NULL WHERE id='material'");
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(message.text()); });
  await page.route('https://**/*', route => route.abort()); (page as Page & { errors: string[] }).errors = errors;
});
test.afterEach(async ({ page }) => expect((page as Page & { errors: string[] }).errors).toEqual([]));

test('cuatro consultas privadas: matriz HTTP real, proyecciones y validación', async ({ page, browser }) => {
  const paths = ['/services/admin/all', '/barbers/admin/all', '/products/admin/movements', '/barbers/me/profile'];
  for (const endpoint of paths) expect((await page.request.get('/api' + endpoint)).status()).toBe(401);
  for (const role of ['admin', 'barbero', 'cliente']) {
    const context = await browser.newContext({ baseURL: fixture.url }); const peer = await context.newPage(); await login(peer, role);
    for (const endpoint of paths) {
      const own = endpoint.endsWith('/me/profile'), allowed = own ? role === 'barbero' : role === 'admin';
      const response = await context.request.get('/api' + endpoint); expect(response.status()).toBe(allowed ? 200 : 403);
      if (allowed) { expect(await response.text()).not.toMatch(/password_hash|session_id|JWT_KEYS|user_id/); expect((await context.request.get('/api' + endpoint + '?userId=other')).status()).toBe(400); }
    }
    if (role === 'barbero') expect((await (await context.request.get('/api/barbers/me/profile')).json()).barber.id).toBe(fixture.actors.barbero.profile);
    await context.close();
  }
  await login(page);
  for (const query of ['page=0', 'page=-1', 'page=1.5', 'page=1000001', 'pageSize=101', 'pageSize[]=1', 'productId[]=pomada']) expect((await page.request.get('/api/products/admin/movements?' + query)).status()).toBe(400);
  const empty = await (await page.request.get('/api/products/admin/movements?productId=nonexistent&page=2&pageSize=1')).json(); expect(empty.movements).toEqual([]); expect(empty.total).toBe(0);
});

test('rutas por rol, alias con sección, recarga y panel ajeno', async ({ page }) => {
  await page.goto('/administracion?tab=servicios'); await expect(page).toHaveURL(/ingresar\?returnTo=/);
  await login(page); await page.goto('/admin/dashboard.html?tab=tienda&origen=guardado#contenido'); await expect(page).toHaveURL(/administracion\?tab=tienda&origen=guardado#contenido/); await expect(page.getByRole('heading', { level: 2, name: 'Productos', exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('form', { name: 'Crear producto' })).toBeHidden(); await page.locator('summary').filter({ hasText: 'Crear producto' }).click(); await expect(page.getByRole('form', { name: 'Crear producto' })).toBeVisible();
  await page.goto('/barbero'); await expect(page.getByRole('heading', { name: 'Acceso no permitido' })).toBeVisible();
  await login(page, 'barbero'); await page.goto('/barbero/dashboard.html?tab=horario'); await expect(page.getByRole('form', { name: 'Horario de atención' })).toBeVisible();
  await page.goto('/administracion'); await expect(page.getByRole('heading', { name: 'Acceso no permitido' })).toBeVisible();
  await login(page, 'cliente'); await page.goto('/barbero'); await expect(page.getByRole('heading', { name: 'Acceso no permitido' })).toBeVisible();
});

test('mutaciones administrativas rechazan otros roles aunque invoquen la API directamente', async ({ page }) => {
  for (const actor of ['cliente', 'barbero']) {
    await login(page, actor);
    for (const [endpoint, method] of [['/services', 'POST'], ['/services/rf014-service', 'PATCH'], ['/barbers', 'POST'], ['/products', 'POST'], ['/products/pomada', 'PATCH'], ['/inventory', 'POST'], ['/inventory/material', 'PATCH'], ['/purchases/confirm', 'POST'], ['/purchases/extract', 'POST'], ['/promotions', 'POST'], ['/orders/nonexistent/status', 'PATCH']]) {
      expect((await api(page.context(), endpoint, {}, method)).status()).toBe(403);
    }
    for (const endpoint of ['/clients', '/products/admin/all', '/products/admin/inventory-summary', '/purchases', '/promotions', '/promotions/segments/counts', '/analytics/overview']) expect((await page.request.get('/api' + endpoint)).status()).toBe(403);
  }
});

test('barbero completa propia visita una vez y acredita diez puntos', async ({ page }) => {
  await sql("UPDATE reservations SET status='confirmed' WHERE id='own-complete'"); await sql('UPDATE clients SET loyalty_points=180,loyalty_level=? WHERE id=?', ['Plata', fixture.actors.cliente.profile]);
  await login(page, 'barbero'); const card = page.getByTestId('staff-visit').filter({ hasText: '2099-07-01' }); await expect(card).toContainText('Corte original');
  expect(await page.getByTestId('staff-visit').filter({ hasText: '2099-07-04' }).count()).toBe(0);
  await confirm(page, card, 'Completar visita'); await expect(card).toContainText('190 puntos · Plata'); await expect(card).toContainText('Completada');
  expect((await api(page.context(), '/reservations/own-complete/complete', {}, 'PATCH')).status()).toBe(409);
  expect((await api(page.context(), '/reservations/foreign/complete', {}, 'PATCH')).status()).toBe(403);
  expect((await sql('SELECT loyalty_points FROM clients WHERE id=?', [fixture.actors.cliente.profile]))[0].loyalty_points).toBe(190);
  await tab(page, 'Estadísticas'); await expect(page.getByText('Atenciones completadas', { exact: true })).toBeVisible();
});

test('reprogramación conflictiva preserva snapshot y cancelar exige confirmación', async ({ page }) => {
  await sql("UPDATE reservations SET status='confirmed',date='2099-07-02',start_time='09:00',end_time='09:45' WHERE id='own-reschedule'");
  await sql("UPDATE reservations SET status='confirmed' WHERE id='own-cancel'"); await login(page, 'barbero');
  const card = page.getByTestId('staff-visit').filter({ hasText: '2099-07-02 · 09:00' }); await card.getByRole('button', { name: 'Proponer otro horario' }).click();
  const form = card.getByRole('form', { name: 'Reprogramar visita' }); await form.getByLabel('Nueva hora').fill('11:00'); await form.getByRole('button', { name: 'Guardar nuevo horario' }).click(); await page.getByRole('dialog', { name: 'Confirmar nuevo horario' }).getByRole('button', { name: 'Confirmar nuevo horario definitivamente' }).click(); await expect(form.getByRole('alert')).toBeVisible();
  expect((await sql("SELECT start_time,service_price_snapshot FROM reservations WHERE id='own-reschedule'"))[0]).toMatchObject({ start_time: '09:00:00', service_price_snapshot: 10000 });
  await form.getByLabel('Nueva hora').fill('13:00'); await form.getByRole('button', { name: 'Guardar nuevo horario' }).click(); await page.getByRole('dialog', { name: 'Confirmar nuevo horario' }).getByRole('button', { name: 'Confirmar nuevo horario definitivamente' }).click();
  await expect(page.getByTestId('staff-visit').filter({ hasText: '2099-07-02 · 13:00' })).toContainText('$10.000');
  const cancel = page.getByTestId('staff-visit').filter({ hasText: '2099-07-03' }); await cancel.getByRole('button', { name: 'Cancelar visita', exact: true }).click(); await page.keyboard.press('Escape');
  await expect(cancel.getByRole('button', { name: 'Cancelar visita', exact: true })).toBeFocused(); expect((await sql("SELECT status FROM reservations WHERE id='own-cancel'"))[0].status).toBe('confirmed');
  await confirm(page, cancel, 'Cancelar visita'); await expect(cancel).toContainText('Cancelada');
});

test('clientes y documentos limitados al barbero; carga y borrado multipart reales', async ({ page, browser }) => {
  await login(page, 'barbero'); await tab(page, 'Clientes'); await selectClient(page, 'cliente'); await expect(page.locator('.staff-client-row').filter({ hasText: fixture.actors.cliente2.email })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Historial autorizado' })).toBeVisible();
  const upload = page.getByRole('form', { name: 'Subir foto de atención' }); await upload.getByLabel('Imagen de atención').setInputFiles({ name: 'atencion.png', mimeType: 'image/png', buffer: png }); await formSave(upload); await expect(upload.getByRole('status')).toContainText('Cambios confirmados');
  const [photo] = await sql('SELECT id,photo_url FROM haircut_photos WHERE client_id=? ORDER BY created_at DESC LIMIT 1', [fixture.actors.cliente.profile]);
  const read = await page.request.get(photo.photo_url); expect(read.status()).toBe(200); expect(read.headers()['content-type']).toContain('image/');
  const otherContext = await browser.newContext({ baseURL: fixture.url }); const other = await otherContext.newPage(); await login(other, 'barbero2'); expect((await otherContext.request.get(photo.photo_url)).status()).toBe(404); expect((await api(otherContext, '/photos/' + photo.id, {}, 'DELETE')).status()).toBe(403); await otherContext.close();
  expect((await page.request.get('/api/clients/' + fixture.actors.cliente2.profile + '/history')).status()).toBe(403);
  const photoCard = page.locator('figure').filter({ has: page.locator('img[src="' + photo.photo_url + '"]') }); await confirm(page, photoCard, 'Eliminar foto'); await expect(photoCard).toHaveCount(0); expect((await page.request.get(photo.photo_url)).status()).toBe(404);
});

test('notas privadas texto literal, borrado y rechazo admin/otro barbero', async ({ page, browser }) => {
  await login(page, 'barbero'); await tab(page, 'Notas privadas'); const form = page.getByRole('form', { name: 'Nueva nota privada' });
  await form.getByLabel('Contenido de la nota').fill('Preferencia privada <script>window.nota=true</script>'); await formSave(form); await expect(form.getByRole('status')).toContainText('Cambios confirmados');
  const note = page.locator('article').filter({ hasText: 'Preferencia privada <script>' }); await expect(note).toBeVisible(); expect(await page.evaluate(() => (window as unknown as { nota?: boolean }).nota)).toBeUndefined();
  const [{ id }] = await sql('SELECT id FROM notes WHERE content LIKE ?', ['Preferencia privada%']);
  for (const actor of ['admin', 'barbero2']) { const context = await browser.newContext({ baseURL: fixture.url }); const peer = await context.newPage(); await login(peer, actor); expect((await api(context, '/notes/' + id, {}, 'DELETE')).status()).toBe(403); if (actor === 'admin') expect((await context.request.get('/api/notes')).status()).toBe(403); else expect((await (await context.request.get('/api/notes')).json()).notes).toEqual([]); await context.close(); }
  await confirm(page, note, 'Eliminar nota'); await expect(note).toHaveCount(0);
});

test('horario propio validado y materiales: solicitud, competencia y resolución sin sumar cantidad', async ({ page, browser }) => {
  await login(page, 'barbero'); await tab(page, 'Horario'); const form = page.getByRole('form', { name: 'Horario de atención' }); await form.getByLabel('Apertura').fill('20:00'); await form.getByLabel('Cierre').fill('10:00'); await formSave(form); await expect(form.getByRole('alert')).toBeVisible();
  await form.getByLabel('Apertura').fill('10:00'); await form.getByLabel('Cierre').fill('21:00'); await formSave(form); await expect(form.getByRole('status')).toContainText('Cambios confirmados');
  expect((await api(page.context(), '/barbers/' + fixture.actors.barbero2.profile, { work_start: '10:00', work_end: '20:00' }, 'PATCH')).status()).toBe(403);
  await tab(page, 'Materiales'); const material = page.locator('article').filter({ hasText: 'Guantes de trabajo' }); await confirm(page, material, 'Solicitar reposición'); await expect(material).toContainText('Pendiente');
  expect((await api(page.context(), '/inventory/material/request')).status()).toBe(200);
  const context = await browser.newContext({ baseURL: fixture.url }); const peer = await context.newPage(); await login(peer, 'barbero2'); expect((await api(context, '/inventory/material/request')).status()).toBe(409);
  await login(peer); await tab(peer, 'Materiales'); const adminMaterial = peer.locator('article').filter({ hasText: 'Guantes de trabajo' }); await confirm(peer, adminMaterial, 'Aprobar reposición'); await expect(adminMaterial).toContainText('Aprobada'); expect((await sql("SELECT quantity FROM inventory WHERE id='material'"))[0].quantity).toBe(2);
  await adminMaterial.getByRole('button', { name: 'Editar Guantes de trabajo' }).click(); const edit = adminMaterial.getByRole('form'); await edit.getByLabel('Cantidad física').fill('8'); await formSave(edit); await expect(adminMaterial).toContainText('8 unidades'); await context.close();
});

test('administración de servicios y barberos conserva bajas y no expone credenciales', async ({ page }) => {
  await login(page); await tab(page, 'Servicios'); await page.locator('summary').filter({ hasText: 'Crear servicio' }).click(); const form = page.getByRole('form', { name: 'Crear servicio' }); await form.getByLabel('Nombre del servicio').fill('Servicio RF016'); await form.getByLabel('Precio (CLP)').fill('7500'); await form.getByLabel('Duración (minutos)').fill('60'); await formSave(form); await expect(form.getByRole('status')).toContainText('Cambios confirmados');
  const card = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Servicio RF016', exact: true }) }); await card.getByRole('button', { name: 'Editar Servicio RF016' }).click(); const edit = card.getByRole('form'); await edit.getByLabel('Precio (CLP)').fill('8500'); await formSave(edit); await expect(card).toContainText('$8.500');
  await confirm(page, card, 'Desactivar servicio'); await expect(card).toContainText('Inactivo'); expect((await (await page.request.get('/api/services')).json()).services.some((row: { name: string }) => row.name === 'Servicio RF016')).toBe(false);
  await confirm(page, card, 'Reactivar servicio'); await expect(card).toContainText('Activo');
  await tab(page, 'Barberos'); await page.locator('summary').filter({ hasText: 'Crear cuenta de barbero' }).click(); const create = page.getByRole('form', { name: 'Crear cuenta de barbero' }); await create.getByLabel('Nombre', { exact: true }).fill('Barbero RF016'); await create.getByLabel('Correo electrónico').fill('nuevo-rf016@example.test'); await create.getByLabel('Contraseña inicial', { exact: false }).fill('Sintetica-Cuenta-2026'); await create.getByLabel('Especialidad').fill('Cortes clásicos'); await formSave(create); await expect(create.getByRole('status')).toContainText('Cambios confirmados');
  const barber = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Barbero RF016', exact: true }) }); await barber.getByRole('button', { name: 'Editar Barbero RF016' }).click(); await barber.getByRole('form').getByLabel('Especialidad').fill('Barba y corte'); await formSave(barber.getByRole('form')); await expect(barber).toContainText('Barba y corte'); await confirm(page, barber, 'Desactivar barbero'); await expect(barber).toContainText('Inactivo'); await confirm(page, barber, 'Reactivar barbero'); await expect(barber).toContainText('Activo');
});

test('producto multipart: imagen, edición de costo nulo, baja/alta y movimientos paginados', async ({ page }) => {
  await login(page); await tab(page, 'Productos'); await page.locator('summary').filter({ hasText: 'Crear producto' }).click(); const form = page.getByRole('form', { name: 'Crear producto' }); await form.getByLabel('Nombre del producto').fill('Producto RF016'); await form.getByLabel('Precio de venta').fill('9000'); await form.getByLabel('Costo unitario').fill('3000'); await form.getByLabel('Existencias').fill('4'); await form.getByLabel('Imagen nueva', { exact: false }).setInputFiles({ name: 'producto.png', mimeType: 'image/png', buffer: png }); await formSave(form); await expect(form.getByRole('status')).toContainText('Cambios confirmados');
  const card = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Producto RF016', exact: true }) }); await expect(card.locator('img')).toBeVisible(); const src = await card.locator('img').getAttribute('src'); expect((await page.request.get(src!)).status()).toBe(200);
  await card.getByRole('button', { name: 'Editar Producto RF016' }).click(); const edit = card.getByRole('form'); await edit.getByLabel('Costo unitario').fill(''); await edit.getByLabel('Existencias').fill('7'); await edit.getByLabel('Imagen nueva', { exact: false }).setInputFiles({ name: 'producto2.png', mimeType: 'image/png', buffer: png }); await formSave(edit); await expect(card).toContainText('Costo desconocido'); await expect(card).toContainText('7 unidades');
  await confirm(page, card, 'Desactivar producto'); await expect(card).toContainText('Inactivo'); await confirm(page, card, 'Reactivar producto'); await expect(card).toContainText('Activo');
  const [{ id }] = await sql("SELECT id FROM products WHERE name='Producto RF016'"); const response = await (await page.request.get('/api/products/admin/movements?' + new URLSearchParams({ productId: id, pageSize: '1' }))).json(); expect(response.total).toBeGreaterThanOrEqual(2); expect(response.movements).toHaveLength(1); expect(response.movements[0].quantity_delta).toBe(3); expect(response.movements[0].unit_cost).toBeNull();
  await tab(page, 'Movimientos'); await page.getByRole('combobox', { name: 'Producto', exact: true }).selectOption(id); await expect(page.getByRole('cell', { name: '+3', exact: true })).toBeVisible(); await expect(page.getByRole('cell', { name: 'Desconocido', exact: true })).toBeVisible();
});

test('pedido manual confirma una vez stock, movimiento y estado; externo requiere conciliación', async ({ page }) => {
  await login(page, 'cliente'); const result = await api(page.context(), '/orders', { items: [{ productId: 'pomada', quantity: 2 }] }); expect(result.status()).toBe(201); const { order } = await result.json();
  await login(page); await tab(page, 'Pedidos'); const card = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Pedido ' + order.buyOrder, exact: true }) }); await confirm(page, card, 'Confirmar pago manual'); await expect(card).toContainText('Pagado');
  expect((await sql("SELECT stock FROM products WHERE id='pomada'"))[0].stock).toBe(3); expect((await api(page.context(), '/orders/' + order.id + '/status', { status: 'paid' }, 'PATCH')).status()).toBe(409); expect((await sql("SELECT COUNT(*) n FROM stock_movements WHERE reference_id=? AND movement_type='sale'", [order.id]))[0].n).toBe(1);
  await sql('INSERT INTO orders (id,client_id,buy_order,session_id,items,total,mp_preference_id) VALUES (?,?,?,?,?,?,?)', ['legacy-external', fixture.actors.cliente.profile, 'EXTERNO-RF016', 'sintetica', JSON.stringify([{ productId: 'pomada', name: 'Pomada histórica', quantity: 1, price: 10000 }]), 10000, 'external-reference']);
  await page.getByRole('button', { name: 'Actualizar panel' }).click(); const external = page.locator('article').filter({ hasText: 'EXTERNO-RF016' }); await expect(external).toContainText('requiere conciliación'); await expect(external.getByRole('button', { name: 'Confirmar pago manual' })).toHaveCount(0); expect((await api(page.context(), '/orders/legacy-external/status', { status: 'paid' }, 'PATCH')).status()).toBe(409);
});

test('compra manual mezcla existente y nuevo; stock, costo e historial atómicos', async ({ page }) => {
  await login(page); await tab(page, 'Compras'); await page.getByRole('textbox', { name: 'Proveedor', exact: true }).fill('Proveedor RF016 manual'); await page.getByRole('button', { name: 'Agregar línea' }).click(); const first = page.getByRole('region', { name: 'Línea 1', exact: true }); await first.getByRole('combobox', { name: 'Producto', exact: true }).selectOption('pomada'); await first.getByLabel('Cantidad', { exact: true }).fill('3'); await first.getByLabel('Costo unitario').fill('2000');
  await page.getByRole('button', { name: 'Agregar línea' }).click(); const second = page.getByRole('region', { name: 'Línea 2', exact: true }); await second.getByLabel('Nombre nuevo').fill('Nuevo por compra RF016'); await second.getByLabel('Cantidad', { exact: true }).fill('2'); await second.getByLabel('Costo unitario').fill('1000');
  await confirm(page, page, 'Confirmar compra'); await expect(page.getByRole('status').filter({ hasText: 'Compra confirmada:' })).toBeVisible();
  expect((await sql("SELECT stock,cost_price FROM products WHERE id='pomada'"))[0]).toMatchObject({ stock: 8, cost_price: 2000 }); expect((await sql("SELECT stock,cost_price FROM products WHERE name='Nuevo por compra RF016'"))[0]).toMatchObject({ stock: 2, cost_price: 1000 });
  const [purchase] = await sql("SELECT id,total_cost FROM purchases WHERE supplier='Proveedor RF016 manual'"); expect(purchase.total_cost).toBe(8000); expect((await sql('SELECT COUNT(*) n FROM stock_movements WHERE reference_id=?', [purchase.id]))[0].n).toBe(2);
});

test('respuesta de compra perdida permite mismo reintento sin duplicar stock ni escritura por eventos', async ({ page }) => {
  await login(page); await tab(page, 'Compras'); await page.getByRole('textbox', { name: 'Proveedor', exact: true }).fill('Proveedor RF016 perdida'); await page.getByRole('button', { name: 'Agregar línea' }).click(); const line = page.getByRole('region', { name: 'Línea 1', exact: true }); await line.getByRole('combobox').selectOption('pomada'); await line.getByLabel('Cantidad', { exact: true }).fill('2'); await line.getByLabel('Costo unitario').fill('2500');
  const requests: { key: string; body: unknown }[] = []; await page.route('**/api/purchases/confirm', async route => { requests.push({ key: route.request().headers()['idempotency-key'], body: route.request().postDataJSON() }); if (requests.length === 1) { const response = await route.fetch(); expect(response.status()).toBe(201); await route.abort('failed'); } else await route.continue(); });
  await confirm(page, page, 'Confirmar compra'); await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Resultado no confirmado'); await page.getByRole('dialog').getByRole('button', { name: 'Volver sin cambios' }).click();
  await expect(page.getByRole('textbox', { name: 'Proveedor', exact: true })).toBeDisabled(); await page.getByRole('button', { name: 'Actualizar panel' }).click(); await expect(page.getByRole('button', { name: 'Reintentar misma compra', exact: true })).toBeEnabled(); expect(requests).toHaveLength(1);
  await confirm(page, page, 'Reintentar misma compra'); await expect(page.getByRole('status').filter({ hasText: 'Compra confirmada:' })).toBeVisible(); expect(requests).toHaveLength(2); expect(requests[0]).toEqual(requests[1]); expect((await sql("SELECT COUNT(*) n FROM purchases WHERE supplier='Proveedor RF016 perdida'"))[0].n).toBe(1); expect((await sql("SELECT stock FROM products WHERE id='pomada'"))[0].stock).toBe(7);
});

test('extracción simulada real, revisión editable obligatoria, factura privada y confirmación', async ({ page, browser }) => {
  await login(page); await tab(page, 'Compras'); const form = page.getByRole('form', { name: 'Extraer factura' }); await form.getByLabel('Factura (PDF', { exact: false }).setInputFiles({ name: 'factura.pdf', mimeType: 'application/pdf', buffer: pdf }); await form.getByRole('button', { name: 'Extraer propuesta' }).click(); await expect(page.getByRole('status').filter({ hasText: 'Propuesta SIMULADA' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar compra', exact: true })).toBeDisabled(); expect((await sql("SELECT stock FROM products WHERE id='pomada'"))[0].stock).toBe(5);
  const url = await page.getByRole('link', { name: 'Descargar factura privada' }).first().getAttribute('href'); const response = await page.request.get(url!); expect(response.status()).toBe(200); expect(response.headers()['content-disposition']).toContain('attachment'); expect(response.headers()['cache-control']).toContain('no-store');
  const context = await browser.newContext({ baseURL: fixture.url }); expect((await context.request.get(url!)).status()).toBe(401); const peer = await context.newPage(); await login(peer, 'admin2'); expect((await context.request.get(url!)).status()).toBe(404);
  expect((await api(page.context(), '/purchases/confirm', { invoiceFileUrl: url, items: [{ productId: 'pomada', quantity: 1, unitCost: 1234 }] }, 'POST', { 'Idempotency-Key': 'without-review-rf016' })).status()).toBe(400);
  const line = page.getByRole('region', { name: 'Línea 1', exact: true }); await line.getByRole('combobox').selectOption('pomada'); await line.getByLabel('Cantidad', { exact: true }).fill('4'); await line.getByLabel('Costo unitario').fill('1234'); await page.getByRole('textbox', { name: 'Proveedor', exact: true }).fill('Proveedor RF016 revisado'); await page.getByRole('checkbox', { name: 'Revisé proveedor', exact: false }).check();
  await confirm(page, page, 'Confirmar compra'); await expect(page.getByRole('status').filter({ hasText: 'Compra confirmada:' })).toBeVisible(); expect((await sql("SELECT stock,cost_price FROM products WHERE id='pomada'"))[0]).toMatchObject({ stock: 9, cost_price: 1234 }); expect((await context.request.get(url!)).status()).toBe(200); await context.close();
});

test('errores de archivo/proveedor conservan formulario y nunca simulan éxito', async ({ page }) => {
  await login(page); await tab(page, 'Compras'); await page.getByRole('textbox', { name: 'Proveedor', exact: true }).fill('Conservar ante error'); await page.getByRole('button', { name: 'Agregar línea' }).click(); await page.getByLabel('Nombre nuevo').fill('Línea conservada');
  const form = page.getByRole('form', { name: 'Extraer factura' }); await form.getByLabel('Factura (PDF', { exact: false }).setInputFiles({ name: 'falsa.pdf', mimeType: 'application/pdf', buffer: Buffer.from('no es pdf') }); await form.getByRole('button', { name: 'Extraer propuesta' }).click(); await expect(page.getByRole('alert')).toBeVisible(); await expect(page.getByLabel('Nombre nuevo')).toHaveValue('Línea conservada');
  // Route this request to the isolated real PHP process configured AI_MODE=disabled.
  await page.route('**/api/purchases/extract', async route => { const response = await route.fetch({ url: fixture.disabledApiUrl + '/api/purchases/extract' }); expect(response.status()).toBe(503); await route.fulfill({ response }); }); await form.getByLabel('Factura (PDF', { exact: false }).setInputFiles({ name: 'factura.pdf', mimeType: 'application/pdf', buffer: pdf }); await form.getByRole('button', { name: 'Extraer propuesta' }).click(); await expect(page.getByRole('alert')).toContainText('no está disponible'); await expect(page.getByRole('textbox', { name: 'Proveedor', exact: true })).toHaveValue('Conservar ante error');
  await form.getByLabel('Factura (PDF', { exact: false }).setInputFiles({ name: 'grande.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(8388609) }); await form.getByRole('button', { name: 'Extraer propuesta' }).click(); await expect(page.getByRole('alert')).toContainText('8 MiB');
});

test('admin lee historial/fotos pero no crea documentos de barbero ni modifica puntos', async ({ page }) => {
  const [{ loyalty_points: pointsBefore }] = await sql('SELECT loyalty_points FROM clients WHERE id=?', [fixture.actors.cliente.profile]);
  await login(page); await tab(page, 'Clientes'); await selectClient(page, 'cliente'); await expect(page.getByRole('heading', { name: 'Historial autorizado' })).toBeVisible(); await expect(page.getByRole('heading', { name: 'Fotos de atención' })).toBeVisible(); await expect(page.getByRole('form', { name: 'Subir foto de atención' })).toHaveCount(0);
  expect((await api(page.context(), '/notes', { content: 'prohibida' })).status()).toBe(403); expect((await page.request.get('/api/notes')).status()).toBe(403); expect((await api(page.context(), '/photos', { client_id: fixture.actors.cliente.profile, type: 'antes' })).status()).toBe(403);
  expect((await sql('SELECT loyalty_points FROM clients WHERE id=?', [fixture.actors.cliente.profile]))[0].loyalty_points).toBe(pointsBefore);
});

test('administrador puede consultar y retirar foto ajena con confirmación', async ({ page }) => {
  await login(page); await tab(page, 'Clientes'); await selectClient(page, 'cliente2');
  const card = page.locator('figure').filter({ has: page.locator('img[src="/uploads/haircuts/rf015-cliente2.png"]') }); await expect(card.locator('img')).toBeVisible(); expect((await page.request.get('/uploads/haircuts/rf015-cliente2.png')).status()).toBe(200);
  await confirm(page, card, 'Eliminar foto'); await expect(card).toHaveCount(0); expect((await page.request.get('/uploads/haircuts/rf015-cliente2.png')).status()).toBe(404);
});

test('promociones: alta, edición, estados y conteos, sin envío de campañas', async ({ page }) => {
  await login(page); await tab(page, 'Promociones'); await page.locator('summary').filter({ hasText: 'Crear promoción' }).click(); const form = page.getByRole('form', { name: 'Crear promoción' }); await form.getByLabel('Título').fill('Promo RF016'); await form.getByLabel('Descripción').fill('Oferta para revisión'); await form.getByLabel('Segmento').selectOption('vip'); await formSave(form); await expect(form.getByRole('status')).toContainText('Cambios confirmados');
  const card = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Promo RF016', exact: true }) }); await card.getByRole('button', { name: 'Editar promoción' }).click(); const edit = card.getByRole('form'); await edit.getByLabel('Descripción').fill('Descripción corregida'); await formSave(edit); await expect(card).toContainText('Descripción corregida'); await confirm(page, card, 'Desactivar promoción'); await expect(card).toContainText('Inactivo'); await confirm(page, card, 'Reactivar promoción'); await expect(card).toContainText('Activo');
  const counts = await (await page.request.get('/api/promotions/segments/counts')).json(); expect(Object.keys(counts.segments).sort()).toEqual(['inactivos', 'nuevos', 'recurrentes', 'vip']); await expect(page.getByText('Las promociones se registran', { exact: false })).toBeVisible();
});

test('analítica período local, snapshots y costo desconocido se muestran sin convertirlo a cero', async ({ page }) => {
  await sql('INSERT INTO orders (id,client_id,buy_order,session_id,items,total,status,created_at) VALUES (?,?,?,?,?,?,?,?)', ['unknown-cost', fixture.actors.cliente.profile, 'SIN-COSTO-RF016', 'sintetica', JSON.stringify([{ productId: 'pomada', name: 'Pomada sin costo', quantity: 1, price: 10000 }]), 10000, 'paid', '2026-10-29 16:00:00']);
  await login(page); const filter = page.getByRole('form', { name: 'Filtrar indicadores' }); await filter.getByLabel('Mes del dashboard').fill('2026-10'); await filter.getByRole('button', { name: 'Ver mes', exact: true }).click(); await expect(page.getByText('Desconocido: datos incompletos', { exact: true })).toHaveCount(2);
  expect((await page.request.get('/api/analytics/overview?from=2026-01-01&to=2027-12-31')).status()).toBe(400);
  await sql("UPDATE services SET price=29000,name='Nombre modificado' WHERE id='rf014-service'"); await tab(page, 'Agenda'); await page.getByLabel('Mes de agenda').fill('2099-07'); await expect(page.getByTestId('staff-visit').filter({ hasText: '2099-07-01' })).toContainText('Corte original');
});

test('RF020 dashboard mensual reconcilia ingresos, equipo, gráficos y matriz anual', async ({ page }) => {
  test.setTimeout(90000);
  const visits: unknown[] = [], ids: string[] = [], orderIds: string[] = [], orderValues: unknown[] = [];
  for (let index = 0; index < 12; index++) {
    const date = '2040-' + String(index + 1).padStart(2, '0') + '-15';
    for (const [actor, price] of [['barbero', 12000 + index * 1000], ['barbero2', 9000 + index * 750]] as const) {
      const id = 'rf020-' + index + '-' + actor; ids.push(id);
      visits.push(id, fixture.actors.cliente.profile, fixture.actors[actor].profile, 'rf014-service', date, '10:00', '10:45', 'Corte clásico', price, 45, date + ' 13:00:00', date + ' 13:45:00', 'completed');
    }
    const id = 'rf020-order-' + index; orderIds.push(id);
    orderValues.push(id, fixture.actors.cliente.profile, id, id, JSON.stringify([{ productId: 'pomada', name: 'Pomada snapshot', quantity: 1, price: 5000 + index * 300, unitCost: 2000 }]), 5000 + index * 300, 'paid', date + ' 15:00:00');
  }
  try {
    await sql('INSERT INTO reservations (id,client_id,barber_id,service_id,date,start_time,end_time,service_name_snapshot,service_price_snapshot,service_duration_snapshot,starts_at,ends_at,status) VALUES ' + ids.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?)').join(','), visits);
    await sql('INSERT INTO orders (id,client_id,buy_order,session_id,items,total,status,created_at) VALUES ' + orderIds.map(() => '(?,?,?,?,?,?,?,?)').join(','), orderValues);
    await login(page); await page.goto('/administracion?tab=resumen&month=2040-10');
    const metric = page.getByRole('article', { name: 'Ingresos totales del mes', exact: true });
    await expect(metric).toContainText('$44.450');
    await expect(page.getByRole('article', { name: 'Ingresos por servicios', exact: true })).toContainText('$36.750');
    const chart = page.getByRole('region', { name: 'Evolución mensual de ingresos' });
    await expect(chart.getByRole('button')).toHaveCount(12);
    await expect(chart).toContainText('$447.300');
    await chart.getByRole('combobox', { name: 'Ver evolución de' }).selectOption(fixture.actors.barbero.profile);
    await expect(chart).toContainText('$210.000');
    await chart.getByRole('combobox', { name: 'Ver evolución de' }).selectOption('');
    const matrix = page.getByRole('table', { name: 'Ingresos por barbero de enero a diciembre de 2040, en pesos chilenos' });
    await expect(matrix.getByRole('row').filter({ hasText: 'Cuenta sintética barbero2' })).toContainText('$157.500');
    await expect(matrix.getByRole('row').filter({ hasText: 'Total servicios' })).toContainText('$367.500');
    const directory = path.join(root, 'docs/refactor/evidencia/capturas/RF-020'); fs.mkdirSync(directory, { recursive: true });
    await page.screenshot({ path: path.join(directory, 'dashboard-1440.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: path.join(directory, 'dashboard-390.png'), fullPage: true });
    const january = chart.getByRole('button', { name: /^enero de 2040:/ });
    await january.focus(); await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/month=2040-01/); await expect(metric).toContainText('$26.000');
    await page.reload(); await expect(page.getByLabel('Mes del dashboard')).toHaveValue('2040-01'); await expect(metric).toContainText('$26.000');
  } finally {
    await sql('DELETE FROM reservations WHERE id IN (' + ids.map(() => '?').join(',') + ')', ids);
    await sql('DELETE FROM orders WHERE id IN (' + orderIds.map(() => '?').join(',') + ')', orderIds);
  }
});

test('RF020 lecturas fallidas no presentan ingresos cero y permiten recuperar el dashboard', async ({ page }) => {
  await page.route('**/api/reservations', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await login(page);
  await expect(page.getByRole('alert')).toContainText('El servicio no está disponible');
  await expect(page.getByRole('article', { name: 'Ingresos totales del mes', exact: true })).toHaveCount(0);
  await page.unroute('**/api/reservations');
  await page.getByRole('button', { name: 'Reintentar consulta' }).click();
  await expect(page.getByRole('article', { name: 'Ingresos totales del mes', exact: true })).toBeVisible();
  await page.route('**/api/analytics/overview?*', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.getByRole('button', { name: 'Mes siguiente', exact: false }).click();
  await expect(page.getByRole('region', { name: 'Costos y contexto comercial' }).getByRole('alert')).toBeVisible();
  await expect(page.getByRole('article', { name: 'Margen bruto de tienda', exact: true })).toHaveCount(0);
});

test('RF020 mes sin actividad conserva doce meses, equipo y ceros explícitos', async ({ page }) => {
  await login(page); await page.goto('/administracion?tab=resumen&month=2050-02');
  await expect(page.getByRole('article', { name: 'Ingresos totales del mes', exact: true })).toContainText('$0');
  await expect(page.getByRole('status').filter({ hasText: 'Este mes aún no tiene actividad' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Evolución mensual de ingresos' }).getByRole('button')).toHaveCount(12);
  await expect(page.getByRole('table', { name: 'Resultados por barbero · febrero de 2050' }).getByRole('row')).toHaveCount(4);
});

test('RF021 calendario mensual navega años, bisiestos, filtros y selección diaria por teclado', async ({ page }) => {
  test.setTimeout(90000);
  await sql("UPDATE reservations SET status='confirmed' WHERE id IN ('own-complete','own-cancel','own-reschedule')");
  await sql("UPDATE reservations SET date='2099-07-02',start_time='09:00',end_time='09:45' WHERE id='own-reschedule'");
  await login(page); await page.goto('/administracion?tab=agenda&agendaMonth=2099-07');
  const calendar = page.getByRole('table', { name: /Calendario de julio de 2099/ });
  await expect(calendar.getByRole('button')).toHaveCount(31);
  await expect(page.getByTestId('staff-visit')).toHaveCount(5);
  await page.getByRole('button', { name: 'Mes siguiente de agenda', exact: true }).click();
  await expect(page.getByLabel('Mes de agenda')).toHaveValue('2099-08');
  await expect(page.getByRole('heading', { name: 'No hay reservas para este mes' })).toBeVisible();
  await page.getByRole('button', { name: 'Mes anterior de agenda', exact: true }).click();
  await expect(page.getByTestId('staff-visit')).toHaveCount(5);
  await page.getByLabel('Mes de agenda').fill('2026-12');
  await page.getByRole('button', { name: 'Mes siguiente de agenda', exact: true }).click();
  await expect(page.getByLabel('Mes de agenda')).toHaveValue('2027-01');
  await page.getByRole('button', { name: 'Mes anterior de agenda', exact: true }).click();
  await expect(page.getByLabel('Mes de agenda')).toHaveValue('2026-12');
  await page.getByLabel('Mes de agenda').fill('2024-02');
  await expect(page.locator('.calendar-day')).toHaveCount(29);
  await page.getByRole('button', { name: /29 de febrero de 2024, 0 reservas/ }).click();
  await expect(page.getByRole('heading', { name: 'No hay reservas para este día' })).toBeVisible();
  await page.getByLabel('Mes de agenda').fill('2099-07');
  const directory = path.join(root, 'docs/refactor/evidencia/capturas/RF-021'); fs.mkdirSync(directory, { recursive: true });
  await page.screenshot({ path: path.join(directory, 'agenda-mes-1440.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(directory, 'agenda-mes-390.png'), fullPage: true });
  await page.getByRole('combobox', { name: 'Barbero de agenda' }).selectOption(fixture.actors.barbero2.profile);
  await expect(page.getByTestId('staff-visit')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Buscar en el mes' }).fill('sin-coincidencias');
  await expect(page.getByRole('heading', { name: 'No hay reservas para este mes' })).toBeVisible();
  await page.getByRole('button', { name: 'Limpiar filtros' }).click();
  await page.getByRole('button', { name: /2 de julio de 2099, 2 reservas/ }).click();
  await expect(page.getByTestId('staff-visit')).toHaveCount(2);
  await page.reload(); await expect(page).toHaveURL(/agendaDate=2099-07-02/);
  await expect(page.getByTestId('staff-visit')).toHaveCount(2);
  const day = page.getByRole('button', { name: /2 de julio de 2099, 2 reservas/ });
  await day.focus(); await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: /3 de julio de 2099, 1 reservas/ })).toBeFocused();
  await expect(page).toHaveURL(/agendaDate=2099-07-03/);
  await page.getByRole('button', { name: 'Ver todo el mes' }).click();
  await expect(page.getByTestId('staff-visit')).toHaveCount(5);
  await page.getByRole('button', { name: 'Hoy', exact: true }).click();
  await expect(page.locator('.calendar-day[aria-current="date"]')).toHaveAttribute('aria-pressed', 'true');
});

test('RF021 acciones confirmadas de agenda conservan estados, precio y fidelización', async ({ page }) => {
  await sql("UPDATE reservations SET status='confirmed' WHERE id IN ('own-complete','own-cancel','own-reschedule')");
  await login(page); await page.goto('/administracion?tab=agenda&agendaMonth=2099-07&agendaDate=2099-07-01');
  const before = (await sql('SELECT loyalty_points FROM clients WHERE id=?', [fixture.actors.cliente.profile]))[0].loyalty_points;
  await confirm(page, page.getByTestId('staff-visit'), 'Completar visita');
  await expect(page.getByTestId('staff-visit')).toContainText('Completada');
  expect((await sql('SELECT loyalty_points FROM clients WHERE id=?', [fixture.actors.cliente.profile]))[0].loyalty_points).toBe(before + 10);
  await page.getByRole('combobox', { name: 'Estado de agenda' }).selectOption('confirmed');
  await expect(page.getByTestId('staff-visit')).toHaveCount(0);
  await page.getByRole('button', { name: 'Limpiar filtros' }).click();
  await page.getByRole('button', { name: /3 de julio de 2099, 1 reservas/ }).click();
  await confirm(page, page.getByTestId('staff-visit'), 'Cancelar visita');
  await expect(page.getByTestId('staff-visit')).toContainText('Cancelada');
  await page.getByRole('button', { name: /2 de julio de 2099, 2 reservas/ }).click();
  const card = page.getByTestId('staff-visit').filter({ hasText: '2099-07-02 · 09:00' });
  await card.getByRole('button', { name: 'Proponer otro horario' }).click();
  const form = card.getByRole('form'); await form.getByLabel('Nueva hora').fill('13:00');
  await form.getByRole('button', { name: 'Guardar nuevo horario' }).click();
  await page.getByRole('dialog', { name: 'Confirmar nuevo horario' }).getByRole('button', { name: 'Confirmar nuevo horario definitivamente' }).click();
  await expect(page.getByTestId('staff-visit').filter({ hasText: '2099-07-02 · 13:00' })).toContainText('$10.000');
});

test('RF021 error de lectura permite recuperar la agenda sin mostrar días vacíos falsos', async ({ page }) => {
  await login(page);
  await page.route('**/api/reservations', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.goto('/administracion?tab=agenda&agendaMonth=2099-07');
  await expect(page.getByRole('alert')).toContainText('El servicio no está disponible');
  await expect(page.locator('.calendar-day')).toHaveCount(0);
  await page.unroute('**/api/reservations'); await page.getByRole('button', { name: 'Reintentar consulta' }).click();
  await expect(page.locator('.calendar-day')).toHaveCount(31);
});

test('eventos entre dos sesiones actualizan lecturas y conservan edición sin duplicar acciones', async ({ page, browser }) => {
  await login(page); await tab(page, 'Productos'); const card = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Pomada de la casa', exact: true }) }); await card.getByRole('button', { name: 'Editar Pomada de la casa' }).click(); const form = card.getByRole('form'); await form.getByLabel('Nombre del producto').fill('Borrador conservado');
  const context = await browser.newContext({ baseURL: fixture.url }); const peer = await context.newPage(); await login(peer, 'admin2'); expect((await api(context, '/products/pomada', { stock: 11 }, 'PATCH')).status()).toBe(200); await expect(card).toContainText('11 unidades', { timeout: 5000 }); await expect(form.getByLabel('Nombre del producto')).toHaveValue('Borrador conservado'); expect((await sql("SELECT name FROM products WHERE id='pomada'"))[0].name).toBe('Pomada de la casa'); await context.close();
  await tab(page, 'Compras'); await page.getByRole('textbox', { name: 'Proveedor', exact: true }).fill('Edición tras refresco'); await page.getByRole('button', { name: 'Agregar línea' }).click(); await page.getByLabel('Nombre nuevo').fill('Producto sin enviar'); await page.getByRole('button', { name: 'Actualizar panel' }).click(); await expect(page.getByLabel('Nombre nuevo')).toHaveValue('Producto sin enviar'); expect((await sql("SELECT COUNT(*) n FROM products WHERE name='Producto sin enviar'"))[0].n).toBe(0);
});

test('caducidad retira datos privados, cancela suscripción y no persiste documentos en navegador', async ({ page }) => {
  await login(page, 'barbero'); await tab(page, 'Clientes'); await selectClient(page, 'cliente'); await expect(page.getByRole('heading', { name: 'Historial autorizado' })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key !== 'bl_cart'))).toEqual([]); expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key !== 'react-router-scroll-positions'))).toEqual([]);
  await sql('UPDATE jwt_sessions SET revoked_at=UTC_TIMESTAMP(6) WHERE user_id=?', [fixture.actors.barbero.id]); await page.getByRole('button', { name: 'Actualizar panel' }).click(); await expect(page).toHaveURL(/ingresar/); await expect(page.getByRole('heading', { name: 'Historial autorizado' })).toHaveCount(0);
});

test('admin finaliza en otra sesión y barbero recibe puntos/estado sin reenviar formulario abierto', async ({ page, browser }) => {
  await sql("UPDATE reservations SET status='confirmed' WHERE id='own-cancel'"); const [{ loyalty_points: before }] = await sql('SELECT loyalty_points FROM clients WHERE id=?', [fixture.actors.cliente.profile]);
  await login(page, 'barbero'); const card = page.getByTestId('staff-visit').filter({ hasText: '2099-07-03' }); await card.getByRole('button', { name: 'Proponer otro horario' }).click(); await card.getByLabel('Nueva fecha').fill('2099-07-10');
  let writes = 0; page.on('request', request => { if (request.method() === 'PATCH' && request.url().includes('/api/reservations/')) writes++; });
  const context = await browser.newContext({ baseURL: fixture.url }); const peer = await context.newPage(); await login(peer); expect((await api(context, '/reservations/own-cancel/complete', {}, 'PATCH')).status()).toBe(200); await expect(card).toContainText('Completada', { timeout: 5000 }); await expect(card.getByLabel('Nueva fecha')).toHaveValue('2099-07-10'); expect(writes).toBe(0); expect((await sql('SELECT loyalty_points FROM clients WHERE id=?', [fixture.actors.cliente.profile]))[0].loyalty_points).toBe(before + 10); await context.close();
});

test('RF019 búsqueda normalizada, filtros, páginas y formulario recuperable', async ({ page }) => {
  await login(page); await tab(page, 'Servicios');
  const ids: string[] = [];
  try {
    const values: unknown[] = [];
    for (let index = 0; index < 12; index++) {
      const id = 'rf018-' + index; ids.push(id);
      values.push(id, 'Diseño clásico ' + String(index).padStart(2, '0'), 5000, 30, index < 6 ? 1 : 0);
    }
    await sql('INSERT INTO services (id,name,price,duration_minutes,active) VALUES ' + ids.map(() => '(?,?,?,?,?)').join(','), values);
    await page.getByRole('button', { name: 'Actualizar panel' }).click();
    const collection = page.getByRole('region', { name: 'Listado de servicios' });
    await collection.getByRole('searchbox').fill('diseno clasico');
    await expect(collection.getByRole('status')).toContainText('12 de');
    await collection.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(collection.getByRole('navigation')).toContainText('Página 2 de 2');
    await collection.getByLabel('Estado', { exact: true }).selectOption('Inactivo');
    await expect(collection.getByRole('status')).toContainText('6 de');
    await expect(collection.getByRole('heading', { name: 'Diseño clásico 06', exact: true })).toBeVisible();
    await collection.getByRole('searchbox').fill('sin-coincidencias-rf018');
    await expect(collection.getByRole('heading', { name: 'No encontramos coincidencias' })).toBeVisible();
    await collection.getByRole('button', { name: 'Ver todos los registros' }).click();
    await expect(collection.getByRole('searchbox')).toHaveValue('');
    await page.locator('summary').filter({ hasText: 'Crear servicio' }).click();
    const form = page.getByRole('form', { name: 'Crear servicio' });
    await form.getByLabel('Nombre del servicio').fill('Borrador conservado');
    await page.route('**/api/services', route => route.request().method() === 'POST' ? route.fulfill({ status: 409, contentType: 'application/json', body: '{}' }) : route.continue());
    await formSave(form); await expect(form.getByRole('alert')).toBeVisible();
    await expect(form.getByLabel('Nombre del servicio')).toHaveValue('Borrador conservado');
    await page.getByRole('button', { name: 'Actualizar panel' }).click();
    await expect(form.getByLabel('Nombre del servicio')).toHaveValue('Borrador conservado');
    const directory = path.join(root, 'docs/refactor/evidencia/capturas/RF-019'); fs.mkdirSync(directory, { recursive: true });
    await page.screenshot({ path: path.join(directory, 'admin-formulario-error-1440.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(directory, 'admin-formulario-error-390.png'), fullPage: true });
    await page.getByRole('button', { name: 'Secciones · Servicios' }).click();
    await page.getByRole('navigation', { name: 'Secciones del panel' }).getByRole('link', { name: 'Productos', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Productos', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Secciones del panel' })).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { if (ids.length) await sql('DELETE FROM services WHERE id IN (' + ids.map(() => '?').join(',') + ')', ids); }
});

test('revisión visual de todas las secciones, móvil/escritorio, teclado y enlaces directos', async ({ page }) => {
  test.setTimeout(120000); const directory = path.join(root, 'docs/refactor/evidencia/capturas/RF-019'); fs.mkdirSync(directory, { recursive: true });
  for (const role of ['admin', 'barbero']) {
    await login(page, role); const tabs = role === 'admin' ? ['resumen', 'agenda', 'barberos', 'clientes', 'servicios', 'inventario', 'productos', 'compras', 'movimientos', 'pedidos', 'promociones'] : ['agenda', 'clientes', 'fotos', 'notas', 'materiales', 'stats', 'horario'];
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      for (const key of tabs) {
        // Captures visit every screen at machine speed; isolate the shared IP
        // counter in this synthetic DB without changing production rate limits.
        await sql("DELETE FROM cache WHERE `key` LIKE '%api:%'");
        await page.goto((role === 'admin' ? '/administracion' : '/barbero') + '?tab=' + key); await expect(page.getByTestId('identity')).toBeVisible(); await expect(page.locator('.staff-section')).not.toContainText('Actualizando datos…', { timeout: 10000 }); await expect(page.locator('.staff-section').getByRole('alert')).toHaveCount(0);
        if (key === 'clientes' || key === 'fotos') { await selectClient(page, 'cliente'); await expect(page.getByRole('heading', { name: 'Fotos de atención' })).toBeVisible(); }
        await expect(page.locator('.staff-section')).not.toContainText('Actualizando datos…');
        if (key === 'clientes' || key === 'fotos') {
          await expect(page.locator('.staff-detail figure img').first()).toBeVisible();
          await expect.poll(() => page.locator('.staff-detail figure img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: path.join(directory, role + '-' + key + '-' + width + '.png'), fullPage: true });
        if (key === 'agenda') {
          if (role === 'admin') await page.getByLabel('Mes de agenda').fill('2099-07');
          const trigger = page.locator('.staff-section button:not(:disabled)').filter({ hasText: /^Cancelar visita$/ }).first(); await trigger.click(); await expect(page.getByRole('dialog', { name: 'Cancelar visita', exact: true })).toBeVisible();
          await page.screenshot({ path: path.join(directory, role + '-confirmacion-' + width + '.png'), fullPage: true }); await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
        }
      }
    }
    await page.keyboard.press('Control+Home'); await page.keyboard.press('Tab'); const focus = await page.evaluate(() => document.activeElement?.tagName); expect(['A', 'BUTTON', 'INPUT', 'SELECT']).toContain(focus);
  }
});
