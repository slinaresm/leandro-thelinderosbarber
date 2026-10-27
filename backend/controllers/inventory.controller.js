const { randomUUID: uuidv4 } = require('crypto');
const getDb = require('../config/db');
const { nowIso } = require('../utils/now');

// GET /api/inventory - admin ve todo el inventario
async function listInventory(req, res) {
  const db = await getDb();
  const items = await db.prepare('SELECT * FROM inventory ORDER BY quantity ASC').all();
  res.json({ items });
}

// POST /api/inventory - admin agrega producto
async function createItem(req, res) {
  const db = await getDb();
  const { product_name, quantity, min_threshold } = req.body;
  if (!product_name) return res.status(400).json({ error: 'product_name es obligatorio.' });
  const id = uuidv4();
  await db.prepare(`INSERT INTO inventory (id, product_name, quantity, min_threshold) VALUES (?, ?, ?, ?)`)
    .run(id, product_name, quantity || 0, min_threshold || 5);
  res.status(201).json({ item: await db.prepare('SELECT * FROM inventory WHERE id = ?').get(id) });
}

// PATCH /api/inventory/:id - admin actualiza stock
async function updateItem(req, res) {
  const db = await getDb();
  const { id } = req.params;
  const { quantity, min_threshold, request_status } = req.body;
  const existing = await db.prepare('SELECT * FROM inventory WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Producto no encontrado.' });

  await db.prepare(`
    UPDATE inventory SET
      quantity = COALESCE(?, quantity),
      min_threshold = COALESCE(?, min_threshold),
      request_status = COALESCE(?, request_status),
      updated_at = ?
    WHERE id = ?
  `).run(quantity, min_threshold, request_status, nowIso(), id);

  res.json({ item: await db.prepare('SELECT * FROM inventory WHERE id = ?').get(id) });
}

// POST /api/inventory/:id/request - barbero solicita reposicion
async function requestRestock(req, res) {
  const db = await getDb();
  const { id } = req.params;
  const barber = await db.prepare('SELECT id FROM barbers WHERE user_id = ?').get(req.user.id);
  if (!barber) return res.status(403).json({ error: 'Solo barberos pueden solicitar materiales.' });

  const existing = await db.prepare('SELECT * FROM inventory WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Producto no encontrado.' });

  await db.prepare(`UPDATE inventory SET requested_by = ?, request_status = 'pending', updated_at = ? WHERE id = ?`)
    .run(barber.id, nowIso(), id);

  res.json({ item: await db.prepare('SELECT * FROM inventory WHERE id = ?').get(id) });
}

module.exports = { listInventory, createItem, updateItem, requestRestock };
