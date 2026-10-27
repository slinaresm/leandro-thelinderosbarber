const cron = require('node-cron');
const getDb = require('../config/db');
const { todayDate } = require('../utils/now');
const { notifyReminder } = require('./notifications.service');

// Barre las reservas confirmadas de hoy/mañana y dispara recordatorios
// automaticos a las 24h y 2h antes de la cita. Corre cada 15 minutos; cada
// reserva solo recibe cada recordatorio una vez (notified_24h/notified_2h).
async function findUpcomingCandidates(db) {
  const today = todayDate();
  const in2days = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return db.prepare(`
    SELECT r.*, s.name as service_name, ub.name as barber_name, uc.id as client_user_id,
           uc.name as client_name, uc.email as client_email, uc.phone as client_phone
    FROM reservations r
    JOIN services s ON s.id = r.service_id
    JOIN barbers b ON b.id = r.barber_id JOIN users ub ON ub.id = b.user_id
    JOIN clients c ON c.id = r.client_id JOIN users uc ON uc.id = c.user_id
    WHERE r.status = 'confirmed' AND r.date BETWEEN ? AND ?
      AND (r.notified_24h = 0 OR r.notified_2h = 0)
  `).all(today, in2days);
}

async function runReminderSweep() {
  const db = await getDb();
  const candidates = await findUpcomingCandidates(db);
  const now = Date.now();

  for (const reservation of candidates) {
    const apptTime = new Date(`${reservation.date}T${reservation.start_time}:00`).getTime();
    const diffHours = (apptTime - now) / (1000 * 60 * 60);

    if (!reservation.notified_24h && diffHours <= 24 && diffHours > 23.75) {
      try {
        await notifyReminder(reservation, 24);
        await db.prepare('UPDATE reservations SET notified_24h = 1 WHERE id = ?').run(reservation.id);
      } catch (err) {
        console.error('Error en recordatorio 24h:', err.message);
      }
    }

    if (!reservation.notified_2h && diffHours <= 2 && diffHours > 1.75) {
      try {
        await notifyReminder(reservation, 2);
        await db.prepare('UPDATE reservations SET notified_2h = 1 WHERE id = ?').run(reservation.id);
      } catch (err) {
        console.error('Error en recordatorio 2h:', err.message);
      }
    }
  }

  return { checked: candidates.length };
}

function startScheduler() {
  // Cada 15 minutos. Formato cron: minuto hora dia mes dia-semana.
  cron.schedule('*/15 * * * *', () => {
    runReminderSweep().catch((err) => console.error('Error en scheduler de recordatorios:', err.message));
  });
  console.log('Scheduler de recordatorios iniciado (cada 15 min).');
}

module.exports = { startScheduler, runReminderSweep };
