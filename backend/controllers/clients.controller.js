const getDb = require('../config/db');

const LEVEL_THRESHOLDS = [
  { level: 'Black', min: 500 },
  { level: 'Oro', min: 200 },
  { level: 'Plata', min: 80 },
  { level: 'Bronce', min: 0 },
];

function computeLevel(points) {
  return LEVEL_THRESHOLDS.find(t => points >= t.min).level;
}

// GET /api/clients/:id - admin o el propio cliente
async function getClient(req, res) {
  const db = await getDb();
  const { id } = req.params;
  const client = await db.prepare(`
    SELECT c.id, c.loyalty_points, c.loyalty_level, c.birthday, u.name, u.email, u.phone
    FROM clients c JOIN users u ON u.id = c.user_id WHERE c.id = ?
  `).get(id);
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado.' });

  if (req.user.role === 'cliente') {
    const own = await db.prepare('SELECT id FROM clients WHERE user_id = ?').get(req.user.id);
    if (!own || own.id !== id) return res.status(403).json({ error: 'Acceso denegado.' });
  }
  res.json({ client });
}

// GET /api/clients/:id/history - historial de cortes del cliente
async function getClientHistory(req, res) {
  const db = await getDb();
  const { id } = req.params;
  if (req.user.role === 'cliente') {
    const own = await db.prepare('SELECT id FROM clients WHERE user_id = ?').get(req.user.id);
    if (!own || own.id !== id) return res.status(403).json({ error: 'Acceso denegado.' });
  }
  const history = await db.prepare(`
    SELECT r.id, r.date, r.start_time, r.status, s.name as service_name, s.price,
           ub.name as barber_name
    FROM reservations r
    JOIN services s ON s.id = r.service_id
    JOIN barbers b ON b.id = r.barber_id
    JOIN users ub ON ub.id = b.user_id
    WHERE r.client_id = ?
    ORDER BY r.date DESC, r.start_time DESC
  `).all(id);
  res.json({ history });
}

// GET /api/clients - admin: listado completo para segmentacion de marketing
async function listClients(req, res) {
  const db = await getDb();
  const clients = await db.prepare(`
    SELECT c.id, c.loyalty_points, c.loyalty_level, u.name, u.email, u.phone, c.created_at
    FROM clients c JOIN users u ON u.id = c.user_id
    ORDER BY c.created_at DESC
  `).all();
  res.json({ clients });
}

// Suma puntos de fidelizacion (se llama internamente al completar una reserva)
async function addLoyaltyPoints(clientId, points) {
  const db = await getDb();
  const client = await db.prepare('SELECT loyalty_points FROM clients WHERE id = ?').get(clientId);
  if (!client) return;
  const newPoints = client.loyalty_points + points;
  const newLevel = computeLevel(newPoints);
  await db.prepare('UPDATE clients SET loyalty_points = ?, loyalty_level = ? WHERE id = ?')
    .run(newPoints, newLevel, clientId);
  return { points: newPoints, level: newLevel };
}

module.exports = { getClient, getClientHistory, listClients, addLoyaltyPoints, computeLevel };
