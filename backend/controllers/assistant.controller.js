const getDb = require('../config/db');
const { chatWithAssistant } = require('../services/ai.service');
const { WHATSAPP_BUSINESS_NUMBER, BUSINESS_OPEN_HOUR, BUSINESS_CLOSE_HOUR } = require('../config/env');

const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 800;

// Rate limit simple en memoria (por IP) para proteger el costo de la API de
// IA de un endpoint publico sin login. No es distribuido ni sobrevive un
// reinicio del proceso, pero alcanza para el volumen de un sitio de barberia.
const RATE_LIMIT = 20; // mensajes
const RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutos
const hits = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  timestamps.push(now);
  hits.set(ip, timestamps);
  return timestamps.length > RATE_LIMIT;
}

async function buildBusinessInfo() {
  const db = await getDb();
  const services = await db.prepare('SELECT name, price, duration_minutes, description FROM services WHERE active = 1').all();
  const barbers = await db.prepare(`
    SELECT u.name, b.specialty FROM barbers b JOIN users u ON u.id = b.user_id WHERE b.active = 1
  `).all();

  const serviceLines = services
    .map((s) => `- ${s.name}: $${s.price} (${s.duration_minutes} min). ${s.description || ''}`.trim())
    .join('\n');
  const barberLines = barbers.map((b) => `- ${b.name}${b.specialty ? ` (${b.specialty})` : ''}`).join('\n');

  return [
    `Horario de atencion: todos los dias de ${BUSINESS_OPEN_HOUR}:00 a ${BUSINESS_CLOSE_HOUR}:00.`,
    `Contacto WhatsApp: +${WHATSAPP_BUSINESS_NUMBER}.`,
    `Servicios disponibles:\n${serviceLines || '(sin servicios cargados)'}`,
    `Barberos del equipo:\n${barberLines || '(sin barberos cargados)'}`,
    'Programa de fidelizacion: se suman puntos por cada visita, con niveles Bronce, Plata, Oro y Black que dan descuentos y beneficios.',
    'Tambien hay una tienda online de productos de grooming (ceras, aceites, coloñas, etc.) en la seccion "Tienda" del sitio.',
    'Para reservar hora se usa el boton "Reservar ahora", que muestra disponibilidad real en vivo.',
  ].join('\n\n');
}

// POST /api/assistant/chat - chat de FAQ para clientes del sitio publico.
async function chat(req, res) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Demasiados mensajes seguidos. Intenta de nuevo en unos minutos.' });
  }

  const { messages } = req.body;
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'Falta el mensaje.' });
  }
  if (messages.length > MAX_MESSAGES) {
    return res.status(400).json({ error: 'Conversacion demasiado larga, recarga la pagina para empezar de nuevo.' });
  }
  for (const m of messages) {
    if (!m || typeof m.content !== 'string' || !['user', 'assistant'].includes(m.role)) {
      return res.status(400).json({ error: 'Formato de mensaje invalido.' });
    }
    if (m.content.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: 'Mensaje demasiado largo.' });
    }
  }

  const businessInfo = await buildBusinessInfo();
  const reply = await chatWithAssistant({ messages, businessInfo });
  res.json({ reply });
}

module.exports = { chat };
