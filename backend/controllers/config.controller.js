const { WHATSAPP_BUSINESS_NUMBER } = require('../config/env');
const { isCloudApiConfigured } = require('../services/whatsapp.service');

// GET /api/config - configuracion publica no sensible para el frontend
// (numero de WhatsApp, flags de features), evita hardcodear estos valores
// en el HTML/JS estatico.
async function getPublicConfig(req, res) {
  res.json({
    whatsappBusinessNumber: WHATSAPP_BUSINESS_NUMBER,
    whatsappCloudApiEnabled: isCloudApiConfigured(),
  });
}

module.exports = { getPublicConfig };
