const { randomUUID: uuidv4 } = require('crypto');
const bcrypt = require('bcryptjs');
const getDb = require('../config/db');
const { todayDate } = require('../utils/now');
const { toMinutes, BUSINESS_OPEN_HOUR, BUSINESS_CLOSE_HOUR } = require('../utils/time');

// GET /api/barbers - publico (cliente elige barbero)
async function listBarbers(req, res) {
  const db = await getDb();
  const barbers = await db.prepare(`
    SELECT b.id, b.specialty, b.photo_url, b.active, b.work_start, b.work_end, u.name, u.email
    FROM barbers b JOIN users u ON u.id = b.user_id
    WHERE b.active = 1
  `).all();
  res.json({ barbers });
}

// POST /api/barbers - admin crea un barbero (usuario + perfil)
async function createBarber(req, res) {
  const db = await getDb();
  const { name, email, password, specialty, photo_url } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email y password son obligatorios.' });
  }
  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Ya existe una cuenta con ese email.' });

  const userId = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);
  await db.prepare(`INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'barbero')`)
    .run(userId, name, email, passwordHash);

  const barberId = uuidv4();
  await db.prepare(`INSERT INTO barbers (id, user_id, specialty, photo_url) VALUES (?, ?, ?, ?)`)
    .run(barberId, userId, specialty || null, photo_url || null);

  res.status(201).json({ barber: { id: barberId, name, email, specialty, photo_url } });
}

// PATCH /api/barbers/:id - admin edita cualquier barbero; un barbero solo
// puede editar su propio horario de atencion (work_start/work_end), el resto
// de los campos se ignoran si quien llama no es admin.
async function updateBarber(req, res) {
  const db = await getDb();
  const { id } = req.params;
  const barber = await db.prepare('SELECT * FROM barbers WHERE id = ?').get(id);
  if (!barber) return res.status(404).json({ error: 'Barbero no encontrado.' });

  const isAdmin = req.user.role === 'admin';
  if (!isAdmin && barber.user_id !== req.user.id) {
    return res.status(403).json({ error: 'No puedes editar el perfil de otro barbero.' });
  }

  const { specialty, photo_url, active, work_start, work_end } = req.body;

  const hourFormat = /^([01]\d|2[0-3]):00$/;
  for (const [label, value] of [['work_start', work_start], ['work_end', work_end]]) {
    if (value !== undefined && value !== null && !hourFormat.test(value)) {
      return res.status(400).json({ error: `${label} debe tener el formato HH:00 (en punto).` });
    }
  }
  const nextStart = work_start ?? barber.work_start;
  const nextEnd = work_end ?? barber.work_end;
  if (toMinutes(nextStart) >= toMinutes(nextEnd)) {
    return res.status(400).json({ error: 'La hora de apertura debe ser antes que la de cierre.' });
  }
  const globalOpen = BUSINESS_OPEN_HOUR * 60;
  const globalClose = BUSINESS_CLOSE_HOUR * 60;
  if (toMinutes(nextStart) < globalOpen || toMinutes(nextEnd) > globalClose) {
    return res.status(400).json({
      error: `El horario debe estar dentro del horario general de la barberia (${String(BUSINESS_OPEN_HOUR).padStart(2, '0')}:00–${String(BUSINESS_CLOSE_HOUR).padStart(2, '0')}:00).`,
    });
  }

  await db.prepare(`
    UPDATE barbers SET
      specialty = COALESCE(?, specialty),
      photo_url = COALESCE(?, photo_url),
      active = COALESCE(?, active),
      work_start = COALESCE(?, work_start),
      work_end = COALESCE(?, work_end)
    WHERE id = ?
  `).run(
    isAdmin ? (specialty ?? null) : null,
    isAdmin ? (photo_url ?? null) : null,
    isAdmin ? (active ?? null) : null,
    work_start || null,
    work_end || null,
    id
  );

  res.json({ barber: await db.prepare('SELECT * FROM barbers WHERE id = ?').get(id) });
}

// Un barbero solo puede ver su propia info; admin ve todo.
async function assertOwnBarberOrAdmin(db, req, res, barberId) {
  if (req.user.role === 'admin') return true;
  const barber = await db.prepare('SELECT user_id FROM barbers WHERE id = ?').get(barberId);
  if (!barber || barber.user_id !== req.user.id) {
    res.status(403).json({ error: 'No puedes ver informacion de otro barbero.' });
    return false;
  }
  return true;
}

// GET /api/barbers/:id/clients - solo el propio barbero o admin
async function getBarberClients(req, res) {
  const db = await getDb();
  const { id } = req.params;
  if (!(await assertOwnBarberOrAdmin(db, req, res, id))) return;
  const clients = await db.prepare(`
    SELECT DISTINCT c.id, u.name, u.email, u.phone, c.loyalty_level
    FROM reservations r
    JOIN clients c ON c.id = r.client_id
    JOIN users u ON u.id = c.user_id
    WHERE r.barber_id = ? AND r.status != 'cancelled'
  `).all(id);
  res.json({ clients });
}

// GET /api/barbers/:id/stats - estadisticas personales del barbero
async function getBarberStats(req, res) {
  const db = await getDb();
  const { id } = req.params;
  if (!(await assertOwnBarberOrAdmin(db, req, res, id))) return;
  const totalCompleted = (await db.prepare(`
    SELECT COUNT(*) as c FROM reservations WHERE barber_id = ? AND status = 'completed'
  `).get(id)).c;
  const totalUpcoming = (await db.prepare(`
    SELECT COUNT(*) as c FROM reservations WHERE barber_id = ? AND status = 'confirmed' AND date >= ?
  `).get(id, todayDate())).c;
  const uniqueClients = (await db.prepare(`
    SELECT COUNT(DISTINCT client_id) as c FROM reservations WHERE barber_id = ? AND status != 'cancelled'
  `).get(id)).c;

  res.json({ stats: { totalCompleted, totalUpcoming, uniqueClients } });
}

module.exports = { listBarbers, createBarber, updateBarber, getBarberClients, getBarberStats };
