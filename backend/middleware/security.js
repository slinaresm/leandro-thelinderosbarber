const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { IS_PRODUCTION, SITE_ORIGIN } = require('../config/env');
const SESSION_COOKIE = 'bl_session';
const COOKIE_OPTIONS = { httpOnly: true, secure: IS_PRODUCTION, sameSite: 'lax', path: '/', maxAge: 8 * 60 * 60 * 1000 };
function issueSession(res, token) { res.cookie(SESSION_COOKIE, token, COOKIE_OPTIONS); }
function clearSession(res) { res.clearCookie(SESSION_COOKIE, { ...COOKIE_OPTIONS, maxAge: undefined }); }
function readToken(req) { const h = req.headers.authorization || ''; return req.cookies?.[SESSION_COOKIE] || (h.startsWith('Bearer ') ? h.slice(7) : null); }
function allowedOrigin(origin) { return !origin || origin === SITE_ORIGIN; }
function installSecurity(app) {
  app.disable('x-powered-by');
  // Enable only for a known reverse-proxy topology, never trust arbitrary forwarders.
  if (process.env.TRUST_PROXY_HOPS) app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS));
  app.use(helmet({ contentSecurityPolicy: false, strictTransportSecurity: IS_PRODUCTION ? undefined : false }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    const wsOrigin = SITE_ORIGIN.replace(/^http/, 'ws');
    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://unpkg.com https://cdn.socket.io; script-src-attr 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' blob:; connect-src 'self' ${wsOrigin}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`);
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (unsafe && req.path !== '/api/orders/mercadopago/webhook') {
      const origin = req.headers.origin;
      const site = req.headers['sec-fetch-site'];
      if ((origin && !allowedOrigin(origin)) || site === 'cross-site' || (!origin && req.cookies?.[SESSION_COOKIE] && site !== 'same-origin')) {
        return res.status(403).json({ error: 'Origen de solicitud no permitido.' });
      }
    }
    next();
  });
  app.use('/api/', rateLimit({ windowMs: 60 * 1000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Demasiadas solicitudes. Intenta nuevamente en un minuto.' } }));
  app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Demasiados intentos de acceso. Intenta más tarde.' } }));
  app.use('/api/auth/register', rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Demasiados registros. Intenta más tarde.' } }));
}
function htmlCsp(res, html) {
  const hashes = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => `'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`);
  res.setHeader('Content-Security-Policy', res.getHeader('Content-Security-Policy').replace('; script-src-attr', `${hashes.length ? ' ' + hashes.join(' ') : ''}; script-src-attr`));
}
module.exports = { installSecurity, htmlCsp, issueSession, clearSession, readToken, allowedOrigin };
