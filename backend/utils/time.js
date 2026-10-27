// Helpers de tiempo para el motor de reservas
const { BUSINESS_OPEN_HOUR, BUSINESS_CLOSE_HOUR, SLOT_STEP_MINUTES } = require('../config/env');

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function toHHMM(mins) {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

// Genera los horarios candidatos de inicio del dia segun el step configurado,
// dentro de un rango [openMin, closeMin) en minutos. Por defecto usa el horario
// general de la barberia; los llamadores pueden pasar el rango propio de un
// barbero especifico (ver reservations.controller.js).
function generateCandidateSlots(openMin = BUSINESS_OPEN_HOUR * 60, closeMin = BUSINESS_CLOSE_HOUR * 60) {
  const slots = [];
  for (let t = openMin; t < closeMin; t += SLOT_STEP_MINUTES) {
    slots.push(t);
  }
  return slots;
}

// ¿Se solapan dos rangos [aStart,aEnd) y [bStart,bEnd)?
function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

module.exports = { toMinutes, toHHMM, generateCandidateSlots, overlaps, BUSINESS_OPEN_HOUR, BUSINESS_CLOSE_HOUR };
