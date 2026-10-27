const fs = require('fs');
const path = require('path');
const asyncHandler = require('./asyncHandler');
const { requireAuth, requireRole } = require('./auth');
const getDb = require('../config/db');
function installUploads(app, express, root) {
  const options = { dotfiles: 'deny', index: false, setHeaders(res) { res.setHeader('Cache-Control', 'private, no-store'); } };
  app.use('/uploads/invoices', requireAuth, requireRole('admin'), express.static(path.join(root, 'invoices'), options));
  app.use('/uploads/haircuts', requireAuth, asyncHandler(async (req, res, next) => {
    const db = await getDb();
    const photo = await db.prepare('SELECT p.*, c.user_id AS client_user_id, b.user_id AS barber_user_id FROM haircut_photos p JOIN clients c ON c.id=p.client_id JOIN barbers b ON b.id=p.barber_id WHERE p.photo_url=?').get('/uploads/haircuts' + req.path);
    if (!photo || (req.user.role !== 'admin' && req.user.id !== photo.client_user_id && req.user.id !== photo.barber_user_id)) return res.status(404).end();
    next();
  }), express.static(path.join(root, 'haircuts'), options));
  app.use('/uploads/products', express.static(path.join(root, 'products'), { dotfiles: 'deny', index: false }));
}
const validateUpload = asyncHandler(async (req, res, next) => {
  if (!req.file) return next();
  const file = await fs.promises.open(req.file.path, 'r');
  const bytes = Buffer.alloc(16);
  try { await file.read(bytes, 0, 16, 0); } finally { await file.close(); }
  const types = {
    'image/jpeg': bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    'image/png': bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
    'image/webp': bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP',
    'application/pdf': bytes.toString('ascii',0,5) === '%PDF-'
  };
  if (!types[req.file.mimetype]) {
    await fs.promises.unlink(req.file.path);
    return res.status(400).json({ error: 'El archivo no corresponde al formato declarado.' });
  }
  next();
});
module.exports = { installUploads, validateUpload };
