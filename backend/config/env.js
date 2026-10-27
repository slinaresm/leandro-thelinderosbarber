require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { randomBytes } = require('crypto');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const configuredSecret = process.env.JWT_SECRET || '';
if (IS_PRODUCTION && (configuredSecret.length < 32 || /change|dev_secret/i.test(configuredSecret))) throw new Error('Configura JWT_SECRET aleatorio de al menos 32 caracteres en producción.');
const JWT_SECRET = configuredSecret && !/change|dev_secret/i.test(configuredSecret) ? configuredSecret : randomBytes(48).toString('hex');
const SITE_ORIGIN = process.env.SITE_ORIGIN || `http://localhost:${process.env.PORT || 8080}`;
if (IS_PRODUCTION && !SITE_ORIGIN.startsWith('https://')) throw new Error('SITE_ORIGIN debe usar HTTPS en producción.');

module.exports = {
  PORT: process.env.PORT || 8080,
  IS_PRODUCTION, SITE_ORIGIN,
  JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  BUSINESS_OPEN_HOUR: parseInt(process.env.BUSINESS_OPEN_HOUR || '9', 10),
  BUSINESS_CLOSE_HOUR: parseInt(process.env.BUSINESS_CLOSE_HOUR || '22', 10),
  SLOT_STEP_MINUTES: parseInt(process.env.SLOT_STEP_MINUTES || '60', 10),

  // ---- Base de datos ----
  DB_DRIVER: process.env.DB_DRIVER || 'sqlite', // 'sqlite' (dev) | 'postgres' (produccion)
  DATABASE_URL: process.env.DATABASE_URL || '',
  PG_SSL: process.env.PG_SSL === 'true',

  // ---- Notificaciones (email) ----
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || 'Barber Linderos <no-reply@barberlinderos.cl>',
  NOTIFICATIONS_ENABLED: process.env.NOTIFICATIONS_ENABLED !== 'false',

  // ---- WhatsApp ----
  WHATSAPP_BUSINESS_NUMBER: process.env.WHATSAPP_BUSINESS_NUMBER || '56900000000',
  WHATSAPP_CLOUD_API_TOKEN: process.env.WHATSAPP_CLOUD_API_TOKEN || '',
  WHATSAPP_CLOUD_PHONE_ID: process.env.WHATSAPP_CLOUD_PHONE_ID || '',

  // ---- Uploads ----
  UPLOADS_DIR: process.env.UPLOADS_DIR || 'uploads',
  MAX_UPLOAD_MB: parseInt(process.env.MAX_UPLOAD_MB || '8', 10),

  // ---- IA (Gemini, nivel gratuito): lectura de facturas + asistente de clientes ----
  // Sin GEMINI_API_KEY configurada, ambas funciones responden con un error
  // claro en vez de fallar de forma confusa. Key gratuita (sin tarjeta) en
  // https://aistudio.google.com/apikey.
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  // Flash para leer facturas (vision + function calling, prioriza precision).
  GEMINI_MODEL_INVOICE: process.env.GEMINI_MODEL_INVOICE || 'gemini-3.6-flash',
  // Flash-Lite para el chat de FAQ del sitio (mas rapido y barato).
  GEMINI_MODEL_CHAT: process.env.GEMINI_MODEL_CHAT || 'gemini-3.5-flash-lite',

  // ---- Pagos: Mercado Pago (Checkout Pro) ----
  // Access Token de tu propia cuenta de Mercado Pago (Panel de desarrolladores
  // > Tus integraciones > credenciales). Usa las credenciales de PRUEBA
  // mientras desarrollas (empiezan igual pero son de una cuenta de test) y
  // las de PRODUCCION cuando quieras cobrar de verdad. Sin este token
  // configurado, la compra en la tienda responde con un error claro.
  MP_ACCESS_TOKEN: process.env.MP_ACCESS_TOKEN || '',
  // Base publica del backend (para construir las URLs de retorno y el webhook
  // de Mercado Pago). El webhook (pago confirmado en segundo plano) solo
  // funciona si esta URL es accesible desde internet real, no localhost.
  BACKEND_PUBLIC_URL: process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.PORT || 8080}`,
};
