const { randomUUID: uuidv4 } = require('crypto');
const getDb = require('../config/db');
const { toMinutes, toHHMM, generateCandidateSlots, overlaps, BUSINESS_OPEN_HOUR, BUSINESS_CLOSE_HOUR } = require('../utils/time');
const { nowIso } = require('../utils/now');
const { addLoyaltyPoints } = require('./clients.controller');
const { notifyReservationCreated, notifyReservationCancelled } = require('../services/notifications.service');

const POINTS_PER_VISIT = 10;

async function getBookedRanges(db, barberId, date) {
  const rows = await db.prepare(`
    SELECT start_time, end_time FROM reservations
    WHERE barber_id = ? AND date = ? AND status = 'confirmed'
  `).all(barberId, date);
  return rows.map(r => ({ start: toMinutes(r.start_time), end: toMinutes(r.end_time) }));
}

// Intersecta el horario general de la barberia con el horario propio del
// barbero (configurable desde su panel, ver PATCH /api/barbers/:id). Si el
// barbero no tiene horario propio definido, usa el horario general completo.
function getEffectiveHours(barber) {
  const globalOpen = BUSINESS_OPEN_HOUR * 60;
  const globalClose = BUSINESS_CLOSE_HOUR * 60;
  const barberOpen = barber && barber.work_start ? toMinutes(barber.work_start) : globalOpen;
  const barberClose = barber && barber.work_end ? toMinutes(barber.work_end) : globalClose;
  return {
    openMin: Math.max(globalOpen, barberOpen),
    closeMin: Math.min(globalClose, barberClose),
  };
}

// GET /api/reservations/availability?barberId=&date=&serviceId=
async function getAvailability(req, res) {
  const db = await getDb();
  const { barberId, date, serviceId } = req.query;
  if (!barberId || !date || !serviceId) {
    return res.status(400).json({ error: 'barberId, date y serviceId son requeridos.' });
  }

  const service = await db.prepare('SELECT duration_minutes FROM services WHERE id = ?').get(serviceId);
  if (!service) return res.status(404).json({ error: 'Servicio no encontrado.' });

  const barber = await db.prepare('SELECT id, work_start, work_end FROM barbers WHERE id = ? AND active = 1').get(barberId);
  if (!barber) return res.status(404).json({ error: 'Barbero no encontrado.' });

  const duration = service.duration_minutes;
  const booked = await getBookedRanges(db, barberId, date);
  const { openMin, closeMin } = getEffectiveHours(barber);

  const isToday = date === new Date().toISOString().slice(0, 10);
  const nowMin = isToday ? (new Date().getHours() * 60 + new Date().getMinutes()) : -1;

  const available = generateCandidateSlots(openMin, closeMin)
    .filter(start => start + duration <= closeMin)
    .filter(start => !isToday || start > nowMin)
    .filter(start => !booked.some(b => overlaps(start, start + duration, b.start, b.end)))
    .map(start => toHHMM(start));

  res.json({ date, barberId, serviceId, durationMinutes: duration, availableSlots: available });
}

// POST /api/reservations - cliente crea reserva (bloqueo automatico de horario)
async function createReservation(req, res) {
  const db = await getDb();
  const { barberId, serviceId, date, startTime, notes } = req.body;
  if (!barberId || !serviceId || !date || !startTime) {
    return res.status(400).json({ error: 'barberId, serviceId, date y startTime son requeridos.' });
  }

  const client = await db.prepare('SELECT id FROM clients WHERE user_id = ?').get(req.user.id);
  if (!client) return res.status(403).json({ error: 'Solo clientes pueden reservar.' });

  const service = await db.prepare('SELECT duration_minutes FROM services WHERE id = ? AND active = 1').get(serviceId);
  if (!service) return res.status(404).json({ error: 'Servicio no encontrado.' });

  const barber = await db.prepare('SELECT id, work_start, work_end FROM barbers WHERE id = ? AND active = 1').get(barberId);
  if (!barber) return res.status(404).json({ error: 'Barbero no encontrado.' });

  const startMin = toMinutes(startTime);
  const endMin = startMin + service.duration_minutes;
  const { openMin, closeMin } = getEffectiveHours(barber);
  if (startMin < openMin || endMin > closeMin) {
    return res.status(409).json({ error: 'El horario elegido esta fuera del horario de atencion de este barbero.' });
  }

  const id = uuidv4();

  // Transaccion: chequeo de solapamiento + insercion son atomicos para evitar
  // doble reserva por condicion de carrera (funciona igual en SQLite y Postgres).
  const tx = db.transaction(async (trx) => {
    const booked = await getBookedRanges(trx, barberId, date);
    const conflict = booked.some(b => overlaps(startMin, endMin, b.start, b.end));
    if (conflict) {
      const err = new Error('Ese horario ya fue reservado. Elige otro.');
      err.status = 409;
      throw err;
    }

    await trx.prepare(`
      INSERT INTO reservations (id, client_id, barber_id, service_id, date, start_time, end_time, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, client.id, barberId, serviceId, date, startTime, toHHMM(endMin), notes || null);
  });

  try {
    await tx();
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const reservation = await db.prepare(`
    SELECT r.*, s.name as service_name, s.price, ub.name as barber_name, uc.name as client_name,
           uc.id as client_user_id, uc.email as client_email, uc.phone as client_phone
    FROM reservations r
    JOIN services s ON s.id = r.service_id
    JOIN barbers b ON b.id = r.barber_id JOIN users ub ON ub.id = b.user_id
    JOIN clients c ON c.id = r.client_id JOIN users uc ON uc.id = c.user_id
    WHERE r.id = ?
  `).get(id);

  // Notificacion en tiempo real: el horario se bloquea para todos los que esten viendo esa agenda
  const io = req.app.get('io');
  io.to(`barber:${barberId}:${date}`).emit('reservation:created', reservation);
  io.to(`admin`).emit('reservation:created', reservation);
  io.to(`barberUser:${barberId}`).emit('reservation:created', reservation);

  // Confirmacion por email/WhatsApp (no bloquea la respuesta si falla el envio)
  notifyReservationCreated(reservation).catch((e) => console.error('Error enviando confirmacion:', e.message));

  res.status(201).json({ reservation });
}

// GET /api/reservations - listado segun rol
async function listReservations(req, res) {
  const db = await getDb();
  const { role, id: userId } = req.user;
  let rows;

  if (role === 'admin') {
    rows = await db.prepare(`
      SELECT r.*, s.name as service_name, s.price, ub.name as barber_name, uc.name as client_name
      FROM reservations r
      JOIN services s ON s.id = r.service_id
      JOIN barbers b ON b.id = r.barber_id JOIN users ub ON ub.id = b.user_id
      JOIN clients c ON c.id = r.client_id JOIN users uc ON uc.id = c.user_id
      ORDER BY r.date DESC, r.start_time DESC
    `).all();
  } else if (role === 'barbero') {
    const barber = await db.prepare('SELECT id FROM barbers WHERE user_id = ?').get(userId);
    rows = await db.prepare(`
      SELECT r.*, s.name as service_name, s.price, uc.name as client_name, uc.phone as client_phone
      FROM reservations r
      JOIN services s ON s.id = r.service_id
      JOIN clients c ON c.id = r.client_id JOIN users uc ON uc.id = c.user_id
      WHERE r.barber_id = ?
      ORDER BY r.date DESC, r.start_time DESC
    `).all(barber ? barber.id : 'none');
  } else {
    const client = await db.prepare('SELECT id FROM clients WHERE user_id = ?').get(userId);
    rows = await db.prepare(`
      SELECT r.*, s.name as service_name, s.price, ub.name as barber_name
      FROM reservations r
      JOIN services s ON s.id = r.service_id
      JOIN barbers b ON b.id = r.barber_id JOIN users ub ON ub.id = b.user_id
      WHERE r.client_id = ?
      ORDER BY r.date DESC, r.start_time DESC
    `).all(client ? client.id : 'none');
  }

  res.json({ reservations: rows });
}

async function assertCanModify(db, req, res, reservation) {
  if (!reservation) {
    res.status(404).json({ error: 'Reserva no encontrada.' });
    return false;
  }
  const { role, id: userId } = req.user;
  if (role === 'admin') return true;
  if (role === 'cliente') {
    const client = await db.prepare('SELECT id FROM clients WHERE user_id = ?').get(userId);
    if (client && client.id === reservation.client_id) return true;
  }
  if (role === 'barbero') {
    const barber = await db.prepare('SELECT id FROM barbers WHERE user_id = ?').get(userId);
    if (barber && barber.id === reservation.barber_id) return true;
  }
  res.status(403).json({ error: 'No tienes permiso sobre esta reserva.' });
  return false;
}

// PATCH /api/reservations/:id/cancel - libera el horario inmediatamente
async function cancelReservation(req, res) {
  const db = await getDb();
  const { id } = req.params;
  const reservation = await db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
  if (!(await assertCanModify(db, req, res, reservation))) return;

  await db.prepare(`UPDATE reservations SET status = 'cancelled', updated_at = ? WHERE id = ?`).run(nowIso(), id);

  const io = req.app.get('io');
  io.to(`barber:${reservation.barber_id}:${reservation.date}`).emit('reservation:cancelled', { id, ...reservation });
  io.to(`admin`).emit('reservation:cancelled', { id, ...reservation });
  io.to(`barberUser:${reservation.barber_id}`).emit('reservation:cancelled', { id, ...reservation });

  notifyReservationCancelled(reservation).catch((e) => console.error('Error enviando cancelacion:', e.message));

  res.json({ message: 'Reserva cancelada. El horario esta disponible de nuevo.' });
}

// PATCH /api/reservations/:id/reschedule
async function rescheduleReservation(req, res) {
  const db = await getDb();
  const { id } = req.params;
  const { date, startTime } = req.body;
  const reservation = await db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
  if (!(await assertCanModify(db, req, res, reservation))) return;

  const service = await db.prepare('SELECT duration_minutes FROM services WHERE id = ?').get(reservation.service_id);
  const startMin = toMinutes(startTime);
  const endMin = startMin + service.duration_minutes;

  const tx = db.transaction(async (trx) => {
    const rows = await trx.prepare(`
      SELECT start_time, end_time FROM reservations
      WHERE barber_id = ? AND date = ? AND status = 'confirmed' AND id != ?
    `).all(reservation.barber_id, date, id);
    const booked = rows.map(r => ({ start: toMinutes(r.start_time), end: toMinutes(r.end_time) }));

    const conflict = booked.some(b => overlaps(startMin, endMin, b.start, b.end));
    if (conflict) {
      const err = new Error('Ese horario ya esta ocupado.');
      err.status = 409;
      throw err;
    }
    await trx.prepare(`
      UPDATE reservations SET date = ?, start_time = ?, end_time = ?, updated_at = ?,
        notified_24h = 0, notified_2h = 0
      WHERE id = ?
    `).run(date, startTime, toHHMM(endMin), nowIso(), id);
  });

  try {
    await tx();
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const updated = await db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
  const io = req.app.get('io');
  io.to(`barber:${reservation.barber_id}:${reservation.date}`).emit('reservation:cancelled', reservation);
  io.to(`barber:${updated.barber_id}:${updated.date}`).emit('reservation:created', updated);
  io.to(`admin`).emit('reservation:updated', updated);
  io.to(`barberUser:${updated.barber_id}`).emit('reservation:updated', updated);

  res.json({ reservation: updated });
}

// PATCH /api/reservations/:id/complete - barbero marca como completada (suma puntos de fidelizacion)
async function completeReservation(req, res) {
  const db = await getDb();
  const { id } = req.params;
  const reservation = await db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
  if (!(await assertCanModify(db, req, res, reservation))) return;
  if (req.user.role === 'cliente') return res.status(403).json({ error: 'Solo el barbero o admin puede completar la cita.' });

  await db.prepare(`UPDATE reservations SET status = 'completed', updated_at = ? WHERE id = ?`).run(nowIso(), id);
  const loyalty = await addLoyaltyPoints(reservation.client_id, POINTS_PER_VISIT);

  const io = req.app.get('io');
  io.to(`admin`).emit('reservation:completed', { id, loyalty });

  res.json({ message: 'Cita marcada como completada.', loyalty });
}

module.exports = {
  getAvailability,
  createReservation,
  listReservations,
  cancelReservation,
  rescheduleReservation,
  completeReservation,
};
