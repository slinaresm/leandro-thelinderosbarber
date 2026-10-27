const fs = require('fs');
const path = require('path');
const express = require('express');
const { verifyToken } = require('./utils/jwt');
const { htmlCsp, readToken } = require('./middleware/security');
const pages = { '/':'index.html', '/tienda':'productos.html', '/producto':'producto.html', '/ingresar':'login.html', '/registro':'register.html', '/reservar':'cliente/reservar.html', '/mi-cuenta/reservas':'cliente/historial.html', '/administracion':'admin/dashboard.html', '/barbero':'barbero/dashboard.html', '/politicas-de-servicio':'politicas-servicio.html' };
const roles = { '/mi-cuenta/reservas':'cliente', '/administracion':'admin', '/barbero':'barbero' };
function installPages(app) {
  const root = path.resolve(__dirname, '../frontend');
  app.use('/assets', express.static(path.join(root, 'assets'), { dotfiles: 'deny', index: false, maxAge: '1h' }));
  for (const [url, file] of Object.entries(pages)) {
    app.get('/' + file, (req, res) => res.redirect(308, url + (req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '')));
    app.get(url, (req, res) => {
      if (roles[url]) {
        try { const user = verifyToken(readToken(req)); if (user.role !== roles[url]) return res.status(403).send('Acceso no autorizado para tu cuenta.'); }
        catch { return res.redirect(303, '/ingresar'); }
        res.setHeader('Cache-Control', 'no-store');
      }
      let html = fs.readFileSync(path.join(root, file), 'utf8');
      htmlCsp(res, html);
      res.type('html').send(html);
    });
  }
  app.get('/robots.txt', (req, res) => res.type('text').send('User-agent: *\nDisallow: /api/\nDisallow: /administracion\nDisallow: /barbero\nDisallow: /mi-cuenta/\n'));
}
module.exports = { installPages, pages };
