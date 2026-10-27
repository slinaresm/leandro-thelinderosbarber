const { randomUUID: uuidv4 } = require('crypto');
const getDb = require('../config/db');
const { daysAgoIso, daysAgoDate } = require('../utils/now');

async function listPromotions(req, res) {
  const db = await getDb();
  const promos = await db.prepare('SELECT * FROM promotions ORDER BY created_at DESC').all();
  res.json({ promotions: promos });
}

async function createPromotion(req, res) {
  const db = await getDb();
  const { title, description, segment } = req.body;
  if (!title || !segment) return res.status(400).json({ error: 'title y segment son obligatorios.' });
  const id = uuidv4();
  await db.prepare(`INSERT INTO promotions (id, title, description, segment) VALUES (?, ?, ?, ?)`)
    .run(id, title, description || null, segment);
  res.status(201).json({ promotion: await db.prepare('SELECT * FROM promotions WHERE id = ?').get(id) });
}

async function updatePromotion(req, res) {
  const db = await getDb();
  const { id } = req.params;
  const { title, description, segment, active } = req.body;
  const existing = await db.prepare('SELECT * FROM promotions WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Promocion no encontrada.' });

  await db.prepare(`
    UPDATE promotions SET
      title = COALESCE(?, title), description = COALESCE(?, description),
      segment = COALESCE(?, segment), active = COALESCE(?, active)
    WHERE id = ?
  `).run(title, description, segment, active, id);

  res.json({ promotion: await db.prepare('SELECT * FROM promotions WHERE id = ?').get(id) });
}

// GET /api/promotions/segments/counts - tamano de cada segmento para el admin
async function getSegmentCounts(req, res) {
  const db = await getDb();
  const nuevos = (await db.prepare(`SELECT COUNT(*) as c FROM clients WHERE created_at >= ?`).get(daysAgoIso(30))).c;
  const inactivos = (await db.prepare(`
    SELECT COUNT(*) as c FROM clients c
    WHERE NOT EXISTS (
      SELECT 1 FROM reservations r WHERE r.client_id = c.id AND r.date >= ?
    )
  `).get(daysAgoDate(60))).c;
  const vip = (await db.prepare(`SELECT COUNT(*) as c FROM clients WHERE loyalty_level IN ('Oro','Black')`).get()).c;
  const recurrentes = (await db.prepare(`
    SELECT COUNT(*) as c FROM (
      SELECT client_id FROM reservations WHERE status != 'cancelled' GROUP BY client_id HAVING COUNT(*) >= 3
    ) t
  `).get()).c;

  res.json({ segments: { nuevos, inactivos, vip, recurrentes } });
}

module.exports = { listPromotions, createPromotion, updatePromotion, getSegmentCounts };
