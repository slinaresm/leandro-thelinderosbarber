const { randomUUID: uuidv4 } = require('crypto');
const getDb = require('../config/db');

// POST /api/notes - barbero crea nota interna sobre un cliente
async function createNote(req, res) {
  const db = await getDb();
  const barber = await db.prepare('SELECT id FROM barbers WHERE user_id = ?').get(req.user.id);
  if (!barber) return res.status(403).json({ error: 'Solo barberos pueden crear notas.' });

  const { client_id, content } = req.body;
  if (!content) return res.status(400).json({ error: 'content es obligatorio.' });

  const id = uuidv4();
  await db.prepare(`INSERT INTO notes (id, barber_id, client_id, content) VALUES (?, ?, ?, ?)`)
    .run(id, barber.id, client_id || null, content);

  res.status(201).json({ note: await db.prepare('SELECT * FROM notes WHERE id = ?').get(id) });
}

// GET /api/notes?clientId= - notas del barbero autenticado (nunca de otros barberos)
async function listNotes(req, res) {
  const db = await getDb();
  const barber = await db.prepare('SELECT id FROM barbers WHERE user_id = ?').get(req.user.id);
  if (!barber) return res.status(403).json({ error: 'Solo barberos pueden ver notas.' });

  const { clientId } = req.query;
  const rows = clientId
    ? await db.prepare('SELECT * FROM notes WHERE barber_id = ? AND client_id = ? ORDER BY created_at DESC').all(barber.id, clientId)
    : await db.prepare('SELECT * FROM notes WHERE barber_id = ? ORDER BY created_at DESC').all(barber.id);

  res.json({ notes: rows });
}

module.exports = { createNote, listNotes };
