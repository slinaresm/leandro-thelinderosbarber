const { randomUUID: uuidv4 } = require('crypto');
const getDb = require('../config/db');

// POST /api/photos - el barbero sube una foto antes/después ligada a un cliente
// (y opcionalmente a una reserva puntual)
async function uploadPhoto(req, res) {
  const db = await getDb();
  const barber = await db.prepare('SELECT id FROM barbers WHERE user_id = ?').get(req.user.id);
  if (!barber) return res.status(403).json({ error: 'Solo barberos pueden subir fotos.' });

  if (!req.file) return res.status(400).json({ error: 'Debes adjuntar una imagen (campo "photo").' });

  const { client_id, reservation_id, type } = req.body;
  if (!client_id || !['antes', 'despues'].includes(type)) {
    return res.status(400).json({ error: 'client_id y type ("antes" o "despues") son obligatorios.' });
  }

  const photoUrl = `/uploads/haircuts/${req.file.filename}`;
  const id = uuidv4();
  await db.prepare(`
    INSERT INTO haircut_photos (id, barber_id, client_id, reservation_id, photo_url, type)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, barber.id, client_id, reservation_id || null, photoUrl, type);

  res.status(201).json({ photo: await db.prepare('SELECT * FROM haircut_photos WHERE id = ?').get(id) });
}

// GET /api/photos?clientId= - fotos de un cliente (barbero que lo atendio, admin, o el propio cliente)
async function listPhotos(req, res) {
  const db = await getDb();
  const { clientId } = req.query;
  const { role, id: userId } = req.user;

  let targetClientId = clientId;

  if (role === 'cliente') {
    const own = await db.prepare('SELECT id FROM clients WHERE user_id = ?').get(userId);
    if (!own) return res.status(403).json({ error: 'Acceso denegado.' });
    targetClientId = own.id; // un cliente solo puede ver sus propias fotos
  } else if (!targetClientId) {
    return res.status(400).json({ error: 'clientId es requerido.' });
  }

  const ownBarber = role === 'barbero' ? await db.prepare('SELECT id FROM barbers WHERE user_id=?').get(userId) : null;
  if (role === 'barbero' && !ownBarber) return res.status(403).json({error:'Acceso denegado.'});
  const photos = await db.prepare(`
    SELECT p.*, ub.name as barber_name
    FROM haircut_photos p
    JOIN barbers b ON b.id = p.barber_id JOIN users ub ON ub.id = b.user_id
    WHERE p.client_id = ? ${role === 'barbero' ? 'AND p.barber_id = ?' : ''}
    ORDER BY p.created_at DESC
  `).all(...(ownBarber ? [targetClientId, ownBarber.id] : [targetClientId]));

  res.json({ photos });
}

// DELETE /api/photos/:id - el barbero que la subio, o el admin
async function deletePhoto(req, res) {
  const db = await getDb();
  const { id } = req.params;
  const photo = await db.prepare('SELECT * FROM haircut_photos WHERE id = ?').get(id);
  if (!photo) return res.status(404).json({ error: 'Foto no encontrada.' });

  if (req.user.role !== 'admin') {
    const barber = await db.prepare('SELECT id FROM barbers WHERE user_id = ?').get(req.user.id);
    if (!barber || barber.id !== photo.barber_id) {
      return res.status(403).json({ error: 'No puedes borrar fotos de otro barbero.' });
    }
  }

  await db.prepare('DELETE FROM haircut_photos WHERE id = ?').run(id);
  res.status(204).send();
}

module.exports = { uploadPhoto, listPhotos, deletePhoto };
