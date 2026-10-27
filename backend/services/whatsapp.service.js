const {
  WHATSAPP_BUSINESS_NUMBER,
  WHATSAPP_CLOUD_API_TOKEN,
  WHATSAPP_CLOUD_PHONE_ID,
} = require('../config/env');

// Genera un link de click-to-chat (wa.me) con mensaje predefinido. Funciona
// sin ninguna credencial ni cuenta de negocio — es lo que usa el frontend
// para el boton de contacto.
function buildClickToChatLink(message, phone = WHATSAPP_BUSINESS_NUMBER) {
  const cleanPhone = String(phone).replace(/[^\d]/g, '');
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

function isCloudApiConfigured() {
  return Boolean(WHATSAPP_CLOUD_API_TOKEN && WHATSAPP_CLOUD_PHONE_ID);
}

// Envio real de mensajes salientes via WhatsApp Cloud API (Meta). Se activa
// automaticamente apenas se configuren WHATSAPP_CLOUD_API_TOKEN y
// WHATSAPP_CLOUD_PHONE_ID en el .env — sin esas variables, queda en modo
// "simulado" (no falla, solo no envia nada real) para que el resto del
// sistema (recordatorios, confirmaciones) funcione igual en desarrollo.
async function sendWhatsAppMessage({ to, message }) {
  if (!to) {
    return { status: 'skipped', reason: 'Sin numero de telefono del cliente.' };
  }

  if (!isCloudApiConfigured()) {
    console.log(`[WhatsApp SIMULADO] Para ${to}: ${message}`);
    return { status: 'simulated', message };
  }

  const cleanTo = String(to).replace(/[^\d]/g, '');
  const url = `https://graph.facebook.com/v20.0/${WHATSAPP_CLOUD_PHONE_ID}/messages`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_CLOUD_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: cleanTo,
      type: 'text',
      text: { body: message },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`WhatsApp Cloud API error ${res.status}: ${errText}`);
  }

  return { status: 'sent', message };
}

module.exports = { buildClickToChatLink, sendWhatsAppMessage, isCloudApiConfigured };
