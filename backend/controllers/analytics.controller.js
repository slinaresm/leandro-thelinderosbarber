const getDb = require('../config/db');
const { daysAgoDate } = require('../utils/now');

// GET /api/analytics/overview - dashboard del administrador
async function getOverview(req, res) {
  const db = await getDb();

  const totalRevenue = (await db.prepare(`
    SELECT COALESCE(SUM(s.price), 0) as total
    FROM reservations r JOIN services s ON s.id = r.service_id
    WHERE r.status = 'completed'
  `).get()).total;

  const totalReservations = (await db.prepare(`SELECT COUNT(*) as c FROM reservations WHERE status != 'cancelled'`).get()).c;
  const totalClients = (await db.prepare(`SELECT COUNT(*) as c FROM clients`).get()).c;
  const totalBarbers = (await db.prepare(`SELECT COUNT(*) as c FROM barbers WHERE active = 1`).get()).c;
  const cancelledCount = (await db.prepare(`SELECT COUNT(*) as c FROM reservations WHERE status = 'cancelled'`).get()).c;

  const topServices = await db.prepare(`
    SELECT s.name, COUNT(*) as bookings, SUM(s.price) as revenue
    FROM reservations r JOIN services s ON s.id = r.service_id
    WHERE r.status != 'cancelled'
    GROUP BY s.id, s.name ORDER BY bookings DESC
  `).all();

  const barberPerformance = await db.prepare(`
    SELECT ub.name as barber_name, COUNT(*) as total_citas,
           SUM(CASE WHEN r.status = 'completed' THEN 1 ELSE 0 END) as completadas
    FROM reservations r
    JOIN barbers b ON b.id = r.barber_id JOIN users ub ON ub.id = b.user_id
    WHERE r.status != 'cancelled'
    GROUP BY b.id, ub.name ORDER BY total_citas DESC
  `).all();

  const reservationsByDay = await db.prepare(`
    SELECT date, COUNT(*) as total FROM reservations
    WHERE status != 'cancelled' AND date >= ?
    GROUP BY date ORDER BY date ASC
  `).all(daysAgoDate(14));

  res.json({
    totalRevenue, totalReservations, totalClients, totalBarbers, cancelledCount,
    topServices, barberPerformance, reservationsByDay,
  });
}

module.exports = { getOverview };
