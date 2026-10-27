const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const { MP_ACCESS_TOKEN, BACKEND_PUBLIC_URL } = require('../config/env');

function getClient() {
  if (!MP_ACCESS_TOKEN) {
    throw new Error('Falta configurar MP_ACCESS_TOKEN en el .env con el Access Token de tu cuenta de Mercado Pago.');
  }
  return new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN });
}

// Crea una preferencia de pago (Checkout Pro). Devuelve la URL (init_point)
// a la que el frontend redirige al cliente para pagar en Mercado Pago.
async function createPreference({ orderId, items, total }) {
  const client = getClient();
  const preference = new Preference(client);

  const response = await preference.create({
    body: {
      items: items.map((i) => ({
        title: i.name,
        quantity: i.quantity,
        unit_price: i.price,
        currency_id: 'CLP',
      })),
      external_reference: orderId,
      back_urls: {
        success: `${BACKEND_PUBLIC_URL}/api/orders/mercadopago/return`,
        failure: `${BACKEND_PUBLIC_URL}/api/orders/mercadopago/return`,
        pending: `${BACKEND_PUBLIC_URL}/api/orders/mercadopago/return`,
      },
      auto_return: 'approved',
      notification_url: `${BACKEND_PUBLIC_URL}/api/orders/mercadopago/webhook`,
    },
  });

  return { preferenceId: response.id, url: response.init_point };
}

// Consulta el estado real de un pago directamente en la API de Mercado Pago
// (nunca se confia en el status que venga en la URL de retorno o el webhook,
// siempre se verifica contra la API con nuestro propio access token).
async function getPayment(paymentId) {
  const client = getClient();
  const payment = new Payment(client);
  return payment.get({ id: paymentId });
}

module.exports = { createPreference, getPayment };
