const { randomUUID: uuidv4 } = require('crypto');
const getDb = require('../config/db');

async function listServices(req, res) {
  const db = await getDb();
  const services = await db.prepare('SELECT * FROM services WHERE active = 1 ORDER BY price ASC').all();
  res.json({ services });
}

async function createService(req, res) {
  const db = await getDb();
  const { name, price, duration_minutes, description } = req.body;
  if (!name || !price || !duration_minutes) {
    return res.status(400).json({ error: 'name, price y duration_minutes son obligatorios.' });
  }
  const id = uuidv4();
  await db.prepare(`INSERT INTO services (id, name, price, duration_minutes, description) VALUES (?, ?, ?, ?, ?)`)
    .run(id, name, price, duration_minutes, description || null);
  res.status(201).json({ service: await db.prepare('SELECT * FROM services WHERE id = ?').get(id) });
}

async function updateService(req, res) {
  const db = await getDb();
  const { id } = req.params;
  const existing = await db.prepare('SELECT * FROM services WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Servicio no encontrado.' });

  const { name, price, duration_minutes, description, active } = req.body;
  await db.prepare(`
    UPDATE services SET
      name = COALESCE(?, name),
      price = COALESCE(?, price),
      duration_minutes = COALESCE(?, duration_minutes),
      description = COALESCE(?, description),
      active = COALESCE(?, active)
    WHERE id = ?
  `).run(name, price, duration_minutes, description, active, id);

  res.json({ service: await db.prepare('SELECT * FROM services WHERE id = ?').get(id) });
}

async function deleteService(req, res) {
  const db = await getDb();
  const { id } = req.params;
  await db.prepare('UPDATE services SET active = 0 WHERE id = ?').run(id);
  res.status(204).send();
}

module.exports = { listServices, createService, updateService, deleteService };
