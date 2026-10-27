const { randomUUID: uuidv4 } = require('crypto');
const nodemailer = require('nodemailer');
const getDb = require('../config/db');
const {
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, NOTIFICATIONS_ENABLED,
} = require('../config/env');
const { sendWhatsAppMessage } = require('./whatsapp.service');

let transporter = null;
function isSmtpConfigured() {
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

function getTransporter() {
  if (!isSmtpConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

// Envio real de email si hay SMTP configurado en .env; si no, queda "simulado"
// (se registra igual en la tabla notifications) para que confirmaciones y
// recordatorios funcionen de punta a punta incluso sin credenciales reales.
async function sendEmail({ to, subject, html, userId, reservationId, type }) {
  const db = await getDb();
  let status = 'simulated';

  if (!NOTIFICATIONS_ENABLED) {
    status = 'simulated';
  } else if (isSmtpConfigured() && to) {
    try {
      await getTransporter().sendMail({ from: SMTP_FROM, to, subject, html });
      status = 'sent';
    } catch (err) {
      status = 'failed';
      console.error('Error enviando email:', err.message);
    }
  } else {
    console.log(`[Email SIMULADO] Para ${to || '(sin email)'} — ${subject}`);
  }

  if (userId) {
    await db.prepare(`
      INSERT INTO notifications (id, user_id, reservation_id, channel, type, message, status)
      VALUES (?, ?, ?, 'email', ?, ?, ?)
    `).run(uuidv4(), userId, reservationId || null, type, subject, status);
  }

  return { status };
}

async function sendWelcomeEmail({ to, name }) {
  return sendEmail({
    to,
    subject: `¡Bienvenido a Barber Linderos, ${name}!`,
    html: `<p>Hola ${name},</p><p>Tu cuenta fue creada con éxito. Ya puedes reservar tu próximo corte en menos de 60 segundos.</p>`,
    type: 'welcome',
  });
}

function formatReservationDetails(r) {
  return `${r.service_name} con ${r.barber_name} el ${r.date} a las ${r.start_time}`;
}

// Se llama justo despues de crear una reserva: confirmacion inmediata por
// email y, si el cliente tiene telefono, tambien por WhatsApp.
async function notifyReservationCreated(reservation) {
  const details = formatReservationDetails(reservation);

  await sendEmail({
    to: reservation.client_email,
    userId: reservation.client_user_id,
    reservationId: reservation.id,
    type: 'confirmacion',
    subject: 'Tu reserva en Barber Linderos está confirmada',
    html: `<p>Hola ${reservation.client_name},</p><p>Tu cita quedó confirmada: <b>${details}</b>.</p><p>Precio: $${reservation.price?.toLocaleString?.('es-CL') ?? reservation.price}</p>`,
  });

  if (reservation.client_phone) {
    try {
      const result = await sendWhatsAppMessage({
        to: reservation.client_phone,
        message: `Hola ${reservation.client_name}! Tu cita en Barber Linderos quedó confirmada: ${details}. Te esperamos ✂️`,
      });
      await logWhatsapp(reservation, 'confirmacion', result);
    } catch (err) {
      console.error('Error enviando WhatsApp de confirmacion:', err.message);
    }
  }
}

async function notifyReservationCancelled(reservation) {
  const details = formatReservationDetails(reservation);
  await sendEmail({
    to: reservation.client_email,
    userId: reservation.client_user_id,
    reservationId: reservation.id,
    type: 'cancelacion',
    subject: 'Tu reserva en Barber Linderos fue cancelada',
    html: `<p>Tu cita (${details}) fue cancelada. Puedes reservar un nuevo horario cuando quieras.</p>`,
  });
}

// Recordatorios automaticos: los llama el scheduler (services/scheduler.service.js)
async function notifyReminder(reservation, hoursBefore) {
  const details = formatReservationDetails(reservation);
  const label = hoursBefore === 24 ? 'mañana' : 'en 2 horas';

  await sendEmail({
    to: reservation.client_email,
    userId: reservation.client_user_id,
    reservationId: reservation.id,
    type: `recordatorio_${hoursBefore}h`,
    subject: `Recordatorio: tu cita es ${label}`,
    html: `<p>Te recordamos tu cita ${label}: <b>${details}</b>.</p>`,
  });

  if (reservation.client_phone) {
    try {
      const result = await sendWhatsAppMessage({
        to: reservation.client_phone,
        message: `Recordatorio Barber Linderos: tu cita es ${label} (${details}).`,
      });
      await logWhatsapp(reservation, `recordatorio_${hoursBefore}h`, result);
    } catch (err) {
      console.error('Error enviando WhatsApp de recordatorio:', err.message);
    }
  }
}

async function logWhatsapp(reservation, type, result) {
  const db = await getDb();
  if (!reservation.client_user_id) return;
  await db.prepare(`
    INSERT INTO notifications (id, user_id, reservation_id, channel, type, message, status)
    VALUES (?, ?, ?, 'whatsapp', ?, ?, ?)
  `).run(uuidv4(), reservation.client_user_id, reservation.id, type, result.message || '', result.status);
}

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  notifyReservationCreated,
  notifyReservationCancelled,
  notifyReminder,
  isSmtpConfigured,
};
