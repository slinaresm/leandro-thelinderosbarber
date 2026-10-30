// Servidor local del paquete estático; producción usará servidor web en RF-017.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { aliases, canonicalPaths } from '../app/paths.mjs';
const root = path.resolve(fileURLToPath(new URL('../build/client/', import.meta.url)));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.ico': 'image/x-icon' };

export function createWebServer({ apiOrigin } = {}) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cache-Control', 'no-store');
    if (url.pathname.startsWith('/api/') || /^\/uploads\/(haircuts|products|invoices)\//.test(url.pathname)) {
      if (!apiOrigin) { res.writeHead(503).end(); return; }
      const upstream = typeof apiOrigin === 'function' ? apiOrigin(req.url, req) : apiOrigin;
      const proxy = http.request(new URL(req.url, upstream), { method: req.method,
        headers: { ...req.headers, host: new URL(upstream).host } }, reply => {
        res.writeHead(reply.statusCode, reply.headers); reply.pipe(res);
      });
      proxy.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
      req.on('aborted', () => proxy.destroy());
      res.on('close', () => proxy.destroy());
      req.pipe(proxy); return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
    if (aliases[url.pathname]) { res.writeHead(308, { Location: aliases[url.pathname] + url.search }).end(); return; }
    if (url.pathname === '/robots.txt') {
      res.setHeader('Content-Type', 'text/plain');
      res.end('User-agent: *\nDisallow: /api/\nDisallow: /administracion\nDisallow: /barbero\nDisallow: /mi-cuenta/\nDisallow: /ingresar\nDisallow: /registro\n'); return;
    }
    let decoded;
    try { decoded = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end(); return; }
    if (decoded.includes('\\') || decoded.split('/').some(part => part.startsWith('.') && part.length > 0)) { res.writeHead(404).end(); return; }
    let file = path.resolve(root, '.' + decoded);
    if (!file.startsWith(root + path.sep) && file !== path.resolve(root)) { res.writeHead(404).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      if (/\.[a-z0-9]+$/i.test(decoded) || decoded.startsWith('/assets/')) { res.writeHead(404).end(); return; }
      file = path.join(root, '__spa-fallback.html');
    }
    const type = mime[path.extname(file)] || 'application/octet-stream';
    const content = fs.readFileSync(file);
    if (type.startsWith('text/html')) {
      const hashes = [...content.toString().matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
        .filter(match => match[1]).map(match => "'sha256-" + crypto.createHash('sha256').update(match[1]).digest('base64') + "'");
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' " + hashes.join(' ') + "; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    }
    res.setHeader('Content-Type', type);
    // Los videos se descargan como Blob; no requieren Range en este ensayo.
    res.writeHead(type.startsWith('text/html') && !canonicalPaths.includes(url.pathname) ? 404 : 200);
    res.end(req.method === 'HEAD' ? undefined : content);
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createWebServer({ apiOrigin: process.env.API_PROXY || 'http://127.0.0.1:8081' });
  server.listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log('Web estática en http://127.0.0.1:' + server.address().port));
}
