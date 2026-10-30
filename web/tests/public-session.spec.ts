import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { aliases, canonicalPaths, routeRoles, roleHome, safeReturnTo } from '../app/paths.mjs';
const require = createRequire(import.meta.url);
const mysql = require('../../node_modules/mysql2/promise');
const fixture = JSON.parse(fs.readFileSync(process.env.WEB_TEST_CONTEXT!, 'utf8'));
const root = path.resolve('..');
const credentials = JSON.parse(fs.readFileSync(process.env.MYSQL_CONNECTION_FILE || path.join(root, '.refactor-data/runtime/'+(process.env.RF_SQL_ENGINE||'mysql')+'.connection.json'), 'utf8'));
if (!/^rf014_test_[a-f0-9]+$/.test(fixture.database)) throw new Error('Base no autorizada para ensayos.');
async function sql(query: string, args: unknown[] = []) {
  const db = await mysql.createConnection({ ...credentials, database: fixture.database });
  try { return (await db.execute(query, args))[0]; } finally { await db.end(); }
}
async function login(page: Page, role = 'cliente', query = '') {
  await page.goto('/ingresar' + query);
  await page.getByLabel('Email', { exact: true }).fill(fixture.actors[role].email);
  await page.getByLabel('Contraseña', { exact: true }).fill(fixture.password);
  await page.getByRole('button', { name: 'Entrar a mi cuenta' }).click();
  await expect(page.getByTestId('identity')).toBeVisible();
}
test.beforeEach(async ({ page }) => {
  await sql('DELETE FROM cache');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) errors.push(message.text());
  });
  await page.route('https://**/*', route => route.abort());
  (page as Page & { scriptErrors?: string[] }).scriptErrors = errors;
});
test.afterEach(async ({ page }) => {
  expect((page as Page & { scriptErrors?: string[] }).scriptErrors, 'Sin errores JS, hidratación o CSP').toEqual([]);
});

test('HTML útil de landing y políticas sin JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL: fixture.url });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('El buen estilo');
  await expect(page.locator('#services-list')).toContainText('Corte de cabello');
  await expect(page.locator('.service-footnote')).toContainText('referencia');
  await expect(page.locator('.faq-list details')).toHaveCount(7);
  await page.goto('/politicas-de-servicio');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Políticas de servicio');
  await expect(page.locator('#cancelaciones')).toContainText('cancelar');
  await context.close();
});

test('rutas públicas por entrada directa y recarga conservan parámetros', async ({ page }) => {
  for (const route of canonicalPaths.filter(value => !Object.keys(routeRoles).includes(value))) {
    await page.goto(route + '?origen=prueba');
    await expect(page.locator('main')).toBeVisible();
    await page.reload();
    await expect(page.locator('main')).toBeVisible();
    expect(new URL(page.url()).searchParams.get('origen')).toBe('prueba');
  }
});

test('todos los alias HTTP 308 conservan query; navegador conserva fragmento', async ({ page, request }) => {
  for (const [alias, target] of Object.entries(aliases)) {
    const response = await request.get(alias + '?x=a%20b&serviceId=abc', { maxRedirects: 0 });
    expect(response.status()).toBe(308);
    expect(response.headers().location).toBe(target + '?x=a%20b&serviceId=abc');
  }
  await page.goto('/cliente/reservar.html?serviceId=abc#horarios');
  await expect(page).toHaveURL(fixture.url + '/reservar?serviceId=abc#horarios');
  await page.reload();
  await expect(page).toHaveURL(fixture.url + '/reservar?serviceId=abc#horarios');
});

test('enlace cliente .html se normaliza sin recargar scripts del legado', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const link = document.createElement('a'); link.href = '/login.html?returnTo=%2Freservar'; link.textContent = 'Enlace antiguo'; document.body.append(link);
  });
  await page.getByText('Enlace antiguo', { exact: true }).click();
  await expect(page).toHaveURL(fixture.url + '/ingresar?returnTo=%2Freservar');
  expect(await page.locator('script[src*="/assets/js/"]').count()).toBe(0);
});

test('404 legible y recursos privados o inexistentes no entregan el shell', async ({ page, request }) => {
  const response = await page.goto('/ruta-inexistente'); expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
  for (const file of ['/assets/no-existe.js', '/.env', '/fonts/no-existe.woff2']) expect((await request.get(file)).status()).toBe(404);
});

test('metadatos SEO, robots y cabeceras del paquete estático', async ({ page, request }) => {
  const home = await request.get('/');
  expect(home.headers()['content-security-policy']).toContain("script-src 'self' 'sha256-");
  expect(home.headers()['x-content-type-options']).toBe('nosniff');
  expect(home.headers()['cache-control']).toBe('no-store');
  expect((await home.text())).toContain('lang="es"');
  expect(await (await request.get('/robots.txt')).text()).toContain('Disallow: /administracion');
  await page.goto('/'); await expect(page).toHaveTitle(/El buen estilo/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Barbería/);
  if (fixture.siteOrigin) await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', fixture.siteOrigin + '/');
  else await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await page.goto('/ingresar');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
});

test('catálogo real y contacto explícito sin scripts ni terceros', async ({ page }) => {
  const requests: string[] = []; page.on('request', request => requests.push(request.url()));
  await page.goto('/');
  await expect(page.locator('.service-footnote')).not.toContainText('referencia');
  await expect(page.locator('#barbers-list')).toContainText('Cuenta sintética barbero');
  await expect(page.getByRole('link', { name: 'Consultar por WhatsApp' })).toHaveAttribute('href', 'https://wa.me/56912345678');
  expect(requests.filter(url => /^https?:/.test(url) && !url.startsWith(fixture.url))).toEqual([]);
  expect(await page.locator('script[src*="/assets/js/"]').count()).toBe(0);
});

test('registro, restauración y logout reales; cookie HttpOnly, sin almacenamiento JWT', async ({ page, context }) => {
  await page.goto('/registro');
  const email = 'nuevo-' + Date.now() + '@rf014.example.test';
  await page.getByLabel('Nombre completo').fill('Registro sintético');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Teléfono').fill('+56 9 1111 2222');
  await page.getByLabel('Contraseña', { exact: true }).fill(fixture.password);
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await expect(page.getByTestId('identity')).toContainText('Registro sintético');
  const cookies = await context.cookies();
  expect(cookies.find(cookie => cookie.name === 'bl_session')?.httpOnly).toBe(true);
  expect(await page.evaluate(() => document.cookie.includes('bl_session'))).toBe(false);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(['bl_cart']);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('bl_cart')!))).toEqual([]);
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  await page.reload();
  await expect(page.getByTestId('identity')).toContainText('Registro sintético');
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Entrar a mi cuenta' })).toBeVisible();
  expect((await sql('SELECT revoked_at FROM jwt_sessions s JOIN users u ON u.id=s.user_id WHERE u.email=?', [email]))[0].revoked_at).not.toBeNull();
  await page.goto('/mi-cuenta/reservas');
  await expect(page).toHaveURL(/\/ingresar\?returnTo=/);
});

test('cada rol restaura su destino y rechaza panel ajeno', async ({ page }) => {
  for (const role of ['admin', 'barbero', 'cliente']) {
    await login(page, role);
    await expect(page).toHaveURL(fixture.url + roleHome(role));
    await page.reload(); await expect(page.getByTestId('identity')).toBeVisible();
    await page.goto(role === 'admin' ? '/barbero' : '/administracion');
    await expect(page.getByRole('heading', { name: 'Acceso no permitido' })).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Entrar a mi cuenta' })).toBeVisible();
  }
});

test('destino profundo privado se recupera tras login', async ({ page }) => {
  await page.goto('/cliente/historial.html?origen=antiguo#cita');
  await expect(page).toHaveURL(/\/ingresar\?returnTo=/);
  await page.getByLabel('Email', { exact: true }).fill(fixture.actors.cliente.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(fixture.password);
  await page.getByRole('button', { name: 'Entrar a mi cuenta' }).click();
  await expect(page).toHaveURL(fixture.url + '/mi-cuenta/reservas?origen=antiguo#cita');
  await expect(page.getByTestId('identity')).toBeVisible();
});

test('retornos externos, ambiguos y de otro rol se descartan', async ({ page }) => {
  for (const bad of ['https://evil.example/', '//evil.example/', '/\\evil.example', '/%2fevil.example', '/administracion', '/ingresar']) expect(safeReturnTo(bad, 'cliente')).toBe('/mi-cuenta/reservas');
  expect(safeReturnTo('/reservar?serviceId=abc#hora', 'cliente')).toBe('/reservar?serviceId=abc#hora');
  expect(safeReturnTo('/reservar?nombre=a%20b#hora', 'cliente')).toBe('/reservar?nombre=a%20b#hora');
  await login(page, 'cliente', '?returnTo=' + encodeURIComponent('//evil.example/'));
  await expect(page).toHaveURL(fixture.url + '/mi-cuenta/reservas');
});

test('credenciales inválidas son recuperables y enfocan el error', async ({ page }) => {
  await page.goto('/ingresar');
  await page.getByLabel('Email', { exact: true }).fill(fixture.actors.cliente.email);
  await page.getByLabel('Contraseña', { exact: true }).fill('incorrecta');
  await page.getByRole('button', { name: 'Entrar a mi cuenta' }).click();
  await expect(page.locator('.form-error')).toBeFocused();
  await expect(page.getByRole('button', { name: 'Entrar a mi cuenta' })).toBeEnabled();
  await page.getByLabel('Contraseña', { exact: true }).fill(fixture.password);
  await page.getByRole('button', { name: 'Entrar a mi cuenta' }).click();
  await expect(page.getByTestId('identity')).toBeVisible();
});

test('CSRF real se renueva por mutación y se bloquean envíos dobles', async ({ page }) => {
  let writes = 0, csrf = 0;
  page.on('request', request => { if (request.url().endsWith('/api/auth/login')) { writes++; expect(request.headers()['x-csrf-token']).toBeTruthy(); } if (request.url().endsWith('/api/auth/csrf')) csrf++; });
  await page.goto('/ingresar');
  await page.getByLabel('Email', { exact: true }).fill(fixture.actors.cliente.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(fixture.password);
  await page.locator('form').evaluate(form => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await expect(page.getByTestId('identity')).toBeVisible(); expect(writes).toBe(1); expect(csrf).toBe(1);
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Entrar a mi cuenta' })).toBeVisible(); expect(csrf).toBe(2);
});

test('expiración real retira identidad y conserva destino al recargar', async ({ page }) => {
  await login(page);
  await sql('UPDATE jwt_sessions SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 MINUTE) WHERE user_id=?', [fixture.actors.cliente.id]);
  await page.reload();
  await expect(page).toHaveURL(/\/ingresar\?returnTo=/);
  await expect(page.getByTestId('identity')).toHaveCount(0);
});

test('logout se propaga entre pestañas sin datos persistidos', async ({ page, context }) => {
  await login(page);
  const other = await context.newPage();
  await other.goto('/mi-cuenta/reservas');
  await expect(other.getByTestId('identity')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(other).toHaveURL(/\/ingresar\?returnTo=/);
  await other.close();
});

test('fallo de red al comprobar sesión ofrece reintento y no afirma expiración', async ({ page }) => {
  await login(page);
  await page.route('**/api/auth/me', route => route.abort());
  await page.reload();
  await expect(page.getByRole('heading', { name: 'No pudimos comprobar tu sesión' })).toBeVisible();
  await page.unroute('**/api/auth/me');
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByTestId('identity')).toBeVisible();
});

test('fallo de logout conserva identidad y no expone errores internos', async ({ page }) => {
  await login(page);
  await page.route('**/api/auth/logout', route => route.fulfill({ status: 503, contentType: 'text/html', body: '<h1>SQL secret=internal</h1>' }));
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page.locator('.global-message')).toContainText('servicio no está disponible');
  await expect(page.getByTestId('identity')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('secret=internal');
});

test('respuesta 401 antigua no borra una restauración posterior válida', async ({ page }) => {
  await login(page);
  let release!: () => void, firstReady!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { firstReady = resolve; });
  let requests = 0;
  await page.route('**/api/auth/me', async route => {
    if (++requests === 1) { firstReady(); await held; await route.fulfill({ status: 401, json: { error: 'No autorizado.' } }); }
    else await route.continue();
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await ready;
  const newer = page.waitForResponse(response => response.url().endsWith('/api/auth/me') && response.status() === 200);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await newer;
  const older = page.waitForResponse(response => response.url().endsWith('/api/auth/me') && response.status() === 401);
  release(); await older;
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.getByTestId('identity')).toBeVisible();
});

test('fallos de catálogo y contacto mantienen contenido editorial sin inventar equipo', async ({ page }) => {
  for (const endpoint of ['services', 'barbers', 'config']) await page.route('**/api/' + endpoint, route => route.fulfill({ status: 503, body: '{}' }));
  await page.goto('/');
  await expect(page.locator('.service-footnote')).toContainText('No pudimos actualizar');
  await expect(page.locator('#barbers-list')).toContainText('No pudimos consultar');
  await expect(page.locator('.whatsapp-contact')).toHaveCount(0);
  await expect(page.locator('#barbers-list .v-barber')).toHaveCount(0);
});

test('configuración sin contacto o malformada no genera WhatsApp', async ({ page }) => {
  for (const value of ['', 'javascript:alert(1)', '123']) {
    await page.route('**/api/config', route => route.fulfill({ json: { whatsappBusinessNumber: value } }));
    await page.goto('/'); await expect(page.locator('.service-footnote')).not.toContainText('referencia');
    await expect(page.locator('.whatsapp-contact')).toHaveCount(0);
    await page.unroute('**/api/config');
  }
});

test('menú móvil, Escape, filtros FAQ y formularios funcionan con teclado', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const toggle = page.locator('button[aria-controls="main-nav"]');
  await toggle.focus(); await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape'); await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Tienda y cuidado', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.faq-list details:not([hidden])')).toHaveCount(2);
  const summary = page.locator('.faq-list details:not([hidden]) summary').first();
  await summary.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.faq-list details:not([hidden])').first()).toHaveAttribute('open', '');
  await page.goto('/ingresar');
  await page.getByLabel('Email', { exact: true }).focus(); await page.keyboard.press('Tab');
  await expect(page.getByLabel('Contraseña', { exact: true })).toBeFocused();
});

test('movimiento reducido deja relato legible y evita descargar video', async ({ page }) => {
  const videos: string[] = []; page.on('request', request => { if (request.url().endsWith('.mp4')) videos.push(request.url()); });
  await page.goto('/');
  await expect(page.locator('.cinema-story')).toHaveClass(/cinema-static/);
  await expect(page.locator('#film-title-4')).toBeVisible();
  expect(videos).toEqual([]);
});

test('cine progresivo puede detenerse; error de video conserva relato', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.locator('.cinema-story')).toHaveClass(/cinema-ready/, { timeout: 30000 });
  await page.getByRole('button', { name: 'Ver sin animación', exact: true }).click();
  await expect(page.locator('.cinema-story')).toHaveClass(/cinema-static/);
  await page.route('**/*.mp4', route => route.fulfill({ status: 404 }));
  await page.reload();
  await expect(page.locator('.cinema-story')).toHaveClass(/cinema-static/);
  await expect(page.locator('#film-title-4')).toBeVisible();
});

test('vistas escritorio y móvil sin desbordamiento, con capturas', async ({ page }) => {
  const folder = path.join(root, 'docs/refactor/evidencia/RF-014-visual'); fs.mkdirSync(folder, { recursive: true });
  for (const [label, width, height] of [['escritorio', 1440, 1000], ['movil', 390, 844]] as const) {
    await page.setViewportSize({ width, height });
    for (const [name, route] of [['inicio', '/'], ['ingreso', '/ingresar'], ['registro', '/registro'], ['politicas', '/politicas-de-servicio']]) {
      await page.goto(route);
      if (route === '/') await expect(page.locator('.service-footnote')).not.toContainText('referencia');
      if (route === '/ingresar') await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
      if (route === '/registro') await expect(page.getByLabel('Nombre completo')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      for (const image of await page.locator('img[loading="lazy"]').all()) {
        await image.scrollIntoViewIfNeeded();
        await expect(image).toHaveJSProperty('complete', true);
        expect(await image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: path.join(folder, name + '-' + label + '.png'), fullPage: true });
    }
  }
});
