import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import cp from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { aliases, canonicalPaths } from '../../../web/app/paths.mjs';
const root = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function apacheRules(csp, origin) {
  assert(origin && new URL(origin).protocol === 'https:' && new URL(origin).origin === origin, 'Origen HTTPS requerido para Apache.');
  return `# RF-017. Apache 2.4; comprobar AllowOverride, mod_rewrite y mod_headers.
Options -Indexes -MultiViews
DirectoryIndex index.html
DirectorySlash Off
ErrorDocument 404 /404.html
LimitRequestBody 12582912
RewriteEngine On
RewriteCond %{HTTPS} !=on
RewriteRule ^ ${origin}%{REQUEST_URI} [R=308,END,NE]
RewriteCond expr "req('Content-Length') -gt 12582912"
RewriteRule ^ - [R=413,END]
RewriteRule (^|/)\\. - [R=404,END]
RewriteRule ^(?:api(?:/.*)?|uploads/(?:haircuts|products|invoices)/.*)$ gateway.php [END]
RewriteCond %{REQUEST_METHOD} !^(GET|HEAD)$
RewriteRule ^ - [R=405,END]
${Object.entries(aliases).map(([from,to]) => `RewriteRule ^${escape(from.slice(1))}$ ${to} [R=308,END]`).join('\n')}
RewriteRule ^$ index.html [END]
RewriteRule ^politicas-de-servicio/?$ politicas-de-servicio/index.html [END]
RewriteRule ^(?:${canonicalPaths.filter(value => !['/', '/politicas-de-servicio'].includes(value)).map(value => escape(value.slice(1))).join('|')})$ __spa-fallback.html [END]
RewriteRule \\.(?:php[0-9]?|phtml|phar|env|sql|sqlite|ini|log|bak)$ - [R=404,END,NC]
RewriteCond %{REQUEST_FILENAME} -f
RewriteRule ^ - [END]
RewriteRule ^ - [R=404,END]
Header always set X-Content-Type-Options "nosniff"
Header always set Referrer-Policy "no-referrer"
Header onsuccess unset Cache-Control
Header always set Cache-Control "no-store, private"
Header always set Strict-Transport-Security "max-age=31536000" "expr=%{HTTPS} == 'on'"
Header always unset X-Powered-By
<FilesMatch "\\.html$">
  Header always set Content-Security-Policy "${csp}"
</FilesMatch>
`;
}
function files(directory, relative = '') {
  return fs.readdirSync(path.join(directory, relative), { withFileTypes: true }).flatMap(entry => {
    assert(!entry.isSymbolicLink(), 'No incluir symlinks en el paquete.');
    const name = path.posix.join(relative, entry.name);
    return entry.isDirectory() ? files(directory, name) : [name];
  }).sort();
}
function copyTree(source, target, filter = () => true) {
  for (const relative of files(source).filter(filter)) {
    const output = path.join(target, relative); fs.mkdirSync(path.dirname(output), { recursive: true }); fs.copyFileSync(path.join(source, relative), output);
  }
}
export async function build({ output, origin, apiPath, publicPath, php = process.env.PHP_BINARY || 'php', composer = process.env.COMPOSER_PHAR }) {
  const site = new URL(origin);
  assert(site.protocol === 'https:' && site.origin === origin && !site.username && !site.password, 'Indicar origen HTTPS sin ruta ni credenciales.');
  assert(/^(?:\/[A-Za-z0-9_./-]+|[A-Za-z]:\/[A-Za-z0-9_./:-]+)$/.test(apiPath) && !apiPath.split('/').includes('..'), 'Ruta absoluta privada de API inválida.');
  assert(typeof publicPath === 'string' && /^(?:\/[A-Za-z0-9_./-]+|[A-Za-z]:\/[A-Za-z0-9_./:-]+)$/.test(publicPath) && !publicPath.split('/').includes('..'), 'Indicar ruta absoluta del DocumentRoot.');
  const normalizedApi = apiPath.toLowerCase().replace(/\/$/, ''), normalizedPublic = publicPath.toLowerCase().replace(/\/$/, '');
  assert(normalizedApi !== normalizedPublic && !normalizedApi.startsWith(normalizedPublic + '/') && !normalizedPublic.startsWith(normalizedApi + '/'), 'La API debe quedar fuera del DocumentRoot.');
  output = path.resolve(output); assert(!fs.existsSync(output), 'Usar una salida nueva.');
  const publicRoot = path.join(output, 'public'), privateRoot = path.join(output, 'private'), api = path.join(privateRoot, 'api');
  fs.mkdirSync(output, { recursive: true });
  copyTree(path.join(root, 'web/build/client'), publicRoot, name => !name.split('/').some(part => part.startsWith('.')) && !name.endsWith('.map'));
  assert(fs.readFileSync(path.join(publicRoot, 'index.html'), 'utf8').includes('rel="canonical" href="' + origin + '/"'), 'Compilar primero web con VITE_SITE_URL igual al origen de publicación.');
  for (const directory of ['app', 'bootstrap', 'config', 'database', 'routes', 'public']) copyTree(path.join(root, 'api', directory), path.join(api, directory), name => !name.split('/').some(part => part.startsWith('.')) && !(directory === 'bootstrap' && name.startsWith('cache/')) && !(directory === 'database' && !name.startsWith('migrations/')));
  for (const name of ['artisan', 'composer.json', 'composer.lock']) fs.copyFileSync(path.join(root, 'api', name), path.join(api, name));
  for (const directory of ['bootstrap/cache', 'storage/app', 'storage/framework/cache/data', 'storage/framework/sessions', 'storage/framework/views', 'storage/logs']) { const target = path.join(api, directory); fs.mkdirSync(target, { recursive: true }); fs.writeFileSync(path.join(target, '.keep'), ''); }
  for (const name of ['schema-manifest.json', 'migrations/001_legacy_baseline.sql']) { const target = path.join(privateRoot, 'database/mysql', name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(root, 'database/mysql', name), target); }
  { const target = path.join(privateRoot, 'database/mariadb/migrations/001_legacy_baseline.sql'); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(root, 'database/mariadb/migrations/001_legacy_baseline.sql'), target); }
  assert(composer && fs.existsSync(composer), 'Indicar COMPOSER_PHAR, sin modificar vendor de desarrollo.');
  const install = cp.spawnSync(php, [composer, 'install', '--no-dev', '--prefer-dist', '--no-interaction', '--classmap-authoritative', '--no-scripts'], { cwd: api, encoding: 'utf8', windowsHide: true });
  assert.equal(install.status, 0, 'Falló Composer de producción. Revisar compatibilidad PHP/conectividad; el paquete parcial no es publicable.');
  const discover = cp.spawnSync(php, ['artisan', 'package:discover', '--no-interaction'], { cwd: api, encoding: 'utf8', windowsHide: true, env: { ...process.env, APP_ENV: 'production', APP_DEBUG: 'false' } });
  assert.equal(discover.status, 0, 'No se pudo descubrir dependencias de producción.');
  const installed = JSON.parse(fs.readFileSync(path.join(api, 'vendor/composer/installed.json'))); assert.equal(installed.dev, false); assert.equal(installed['dev-package-names'].length, 0);
  const html = files(publicRoot).filter(name => name.endsWith('.html')).map(name => fs.readFileSync(path.join(publicRoot, name), 'utf8'));
  const hashes = [...new Set(html.flatMap(content => [...content.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].filter(match => match[1]).map(match => "'sha256-" + crypto.createHash('sha256').update(match[1]).digest('base64') + "'")))];
  const csp = "default-src 'self'; script-src 'self' " + hashes.join(' ') + "; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
  fs.writeFileSync(path.join(publicRoot, '.htaccess'), apacheRules(csp, origin));
  fs.writeFileSync(path.join(publicRoot, '.user.ini'), 'expose_php=Off\ndisplay_errors=Off\nlog_errors=On\nupload_max_filesize=8M\npost_max_size=12M\nmax_execution_time=40\nmemory_limit=256M\n');
  fs.writeFileSync(path.join(publicRoot, '404.html'), '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Página no encontrada</title><h1>Página no encontrada</h1><a href="/">Volver al inicio</a></html>');
  fs.writeFileSync(path.join(publicRoot, 'robots.txt'), 'User-agent: *\nDisallow: /api/\nDisallow: /administracion\nDisallow: /barbero\nDisallow: /mi-cuenta/\nDisallow: /ingresar\nDisallow: /registro\n');
  fs.writeFileSync(path.join(publicRoot, 'gateway.php'), `<?php
// Solo rutas API/archivos. No hay comandos operativos HTTP.
$requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
if (!is_string($requestPath) || !preg_match('~^/(?:api(?:/|$)|uploads/(?:haircuts|products|invoices)/)~', $requestPath)) { http_response_code(404); exit; }
$apiRoot = '${apiPath}';
if (!is_file($apiRoot.'/public/index.php')) { http_response_code(503); header('Cache-Control: no-store'); exit; }
require $apiRoot.'/public/index.php';
`);
  const entries = Object.fromEntries(files(output).map(name => [name, { bytes: fs.statSync(path.join(output, name)).size, sha256: hash(fs.readFileSync(path.join(output, name))) }]));
  assert(!Object.keys(entries).some(name => /(?:^|\/)(?:\.env(?:\.|$)|tests\/|node_modules\/|uploads\/)/.test(name)), 'El paquete contiene datos no publicables.');
  const manifest = { databaseProfiles: ['mysql-8.4', 'mariadb-10.6.28'], format: 'barber-hosting-release-v1', origin, apiPath, publicPath, php: '8.4', hostingDatabase: 'mariadb-10.6.28', provider: 'SolucionHost-compartido', files: entries, csp, externalVerification: 'pending' };
  fs.writeFileSync(path.join(output, 'release.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build({ output: process.argv[2], origin: process.env.REFACTOR_SITE_ORIGIN, apiPath: process.env.REFACTOR_API_PATH, publicPath: process.env.REFACTOR_PUBLIC_PATH }).then(manifest => console.log(JSON.stringify({ status: 'packaged', files: Object.keys(manifest.files).length, verification: manifest.externalVerification }))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
