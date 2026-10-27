const { randomUUID: uuidv4 } = require('crypto');
const getDb = require('../config/db');
const { nowIso } = require('../utils/now');
const mercadopago = require('../services/mercadopago.service');

function generateBuyOrder() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `BL${ts}${rand}`.toUpperCase();
}

async function getOrderItems(db, orderId, legacyItems = '[]') {
  const items = await db.prepare(`SELECT product_id as "productId", product_name as name, unit_price as price, quantity, unit_cost as "unitCost" FROM order_items WHERE order_id = ? ORDER BY created_at, id`).all(orderId);
  return items.length ? items : JSON.parse(legacyItems || '[]');
}

async function recordStockMovement(db, { productId, quantityDelta, unitCost = null, type, referenceId, userId = null }) {
  await db.prepare(`INSERT INTO stock_movements (id, product_id, movement_type, quantity_delta, unit_cost, reference_type, reference_id, created_by)
    VALUES (?, ?, ?, ?, ?, 'order', ?, ?)`)
    .run(uuidv4(), productId, type, quantityDelta, unitCost, referenceId, userId);
}

// POST /api/orders - el cliente arma su carrito y se crea la orden + preferencia de pago
// body: { items: [{ productId, quantity }] }
async function createOrder(req, res) {
  const db = await getDb();
  const client = await db.prepare('SELECT id FROM clients WHERE user_id = ?').get(req.user.id);
  if (!client) return res.status(403).json({ error: 'Solo clientes pueden comprar productos.' });

  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'El carrito esta vacio.' });
  }

  // Precios y stock SIEMPRE se validan contra la base de datos, nunca se confia
  // en lo que mande el frontend (evita que alguien manipule precios en el navegador).
  const orderItems = [];
  let total = 0;

  for (const raw of items) {
    const quantity = parseInt(raw.quantity, 10);
    if (!raw.productId || !quantity || quantity < 1) {
      return res.status(400).json({ error: 'Cada item necesita productId y quantity valido.' });
    }
    const product = await db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(raw.productId);
    if (!product) return res.status(404).json({ error: `Producto no encontrado o no disponible: ${raw.productId}` });
    if (product.stock < quantity) {
      return res.status(409).json({ error: `Stock insuficiente para "${product.name}" (quedan ${product.stock}).` });
    }
    orderItems.push({
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity,
    });
    total += product.price * quantity;
  }

  if (total <= 0) return res.status(400).json({ error: 'El total de la orden debe ser mayor a 0.' });

  const id = uuidv4();
  const buyOrder = generateBuyOrder();

  const tx = db.transaction(async (trx) => {
    await trx.prepare(`INSERT INTO orders (id, client_id, buy_order, session_id, items, total, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')`).run(id, client.id, buyOrder, id, JSON.stringify(orderItems), total);
    for (const item of orderItems) {
      const product = await trx.prepare('SELECT cost_price FROM products WHERE id = ?').get(item.productId);
      await trx.prepare(`INSERT INTO order_items (id, order_id, product_id, product_name, unit_price, quantity, unit_cost)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(uuidv4(), id, item.productId, item.name, item.price, item.quantity, product?.cost_price ?? null);
    }
  });
  await tx();

  // El pago se coordina por WhatsApp (no hay pasarela de pago conectada
  // todavia): la orden queda "pending" con el stock ya validado, y el admin
  // la marca como pagada manualmente desde el panel una vez coordinado el
  // pago con el cliente (ver updateOrderStatus).
  res.status(201).json({
    order: { id, buyOrder, total, status: 'pending', items: orderItems },
  });
}

function resultPageHtml({ ok, title, message, detail }) {
  const color = ok ? '#4ade80' : '#f87171';
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${title} — Barber Linderos</title>
<style>
  body { background:#0a0a0b; color:#f5f5f5; font-family: Inter, Arial, sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
  .card { max-width: 480px; padding: 40px; border: 1px solid #262626; border-radius: 16px; background:#111113; text-align:center; }
  h1 { color:${color}; font-size: 1.5rem; margin-bottom: 12px; }
  p { color:#a3a3a3; line-height:1.5; }
  .detail { margin-top:20px; font-size:0.8rem; color:#737373; }
  .logo { color:#c9a227; font-weight:700; margin-bottom:24px; }
</style>
</head>
<body>
  <div class="card">
    <div class="logo">BARBER LINDEROS</div>
    <h1>${title}</h1>
    <p>${message}</p>
    ${detail ? `<div class="detail">${detail}</div>` : ''}
    <p style="margin-top:24px;">Puedes cerrar esta pestaña y volver a la tienda.</p>
  </div>
</body>
</html>`;
}

// Marca la orden como pagada o fallida segun el pago verificado directamente
// en la API de Mercado Pago. Idempotente: si la orden ya quedo en un estado
// final, no la vuelve a tocar (evita descontar stock dos veces si el retorno
// del navegador y el webhook llegan ambos para el mismo pago).
async function applyPaymentResult(db, order, paymentId, approved, paymentDetail, io) {
  if (order.status === 'paid' || order.status === 'failed') return;

  const tx = db.transaction(async (trx) => {
    if (approved) {
      const items = await getOrderItems(trx, order.id, order.items);
      for (const item of items) {
        const update = await trx.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?')
          .run(item.quantity, item.productId, item.quantity);
        if (update.changes !== 1) { const error = new Error(`Stock insuficiente para confirmar ${item.name}.`); error.status = 409; throw error; }
        await recordStockMovement(trx, { productId: item.productId, quantityDelta: -item.quantity, unitCost: item.unitCost, type: 'sale', referenceId: order.id });
      }
    }
    await trx.prepare(`UPDATE orders SET status = ?, mp_payment_id = ?, payment_detail = ?, updated_at = ? WHERE id = ?`)
      .run(approved ? 'paid' : 'failed', paymentId, JSON.stringify(paymentDetail), nowIso(), order.id);
  });
  await tx();

  if (io) io.to('admin').emit(approved ? 'order:paid' : 'order:failed', { orderId: order.id, buyOrder: order.buy_order });
}

// GET /api/orders/mercadopago/return - Mercado Pago redirige aqui (back_urls) tras el pago.
// Solo mejora la experiencia visual del cliente; la fuente de verdad real es
// el webhook de abajo (este retorno se puede cerrar/bloquear antes de llegar).
async function mercadopagoReturn(req, res) {
  const db = await getDb();
  const orderId = req.query.external_reference;
  const paymentId = req.query.payment_id || req.query.collection_id;
  const status = req.query.status || req.query.collection_status;

  if (!orderId) {
    return res.status(400).send(resultPageHtml({
      ok: false,
      title: 'Solicitud invalida',
      message: 'No se recibio informacion de la orden.',
    }));
  }

  const order = await db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) {
    return res.status(404).send(resultPageHtml({
      ok: false,
      title: 'Orden no encontrada',
      message: 'No encontramos la orden asociada a este pago.',
    }));
  }

  if (!paymentId || status === 'null') {
    return res.send(resultPageHtml({
      ok: false,
      title: 'Pago no completado',
      message: 'Cerraste el pago antes de completarlo. Tu carrito no fue cobrado.',
    }));
  }

  let paymentResult;
  try {
    paymentResult = await mercadopago.getPayment(paymentId);
  } catch (err) {
    return res.status(502).send(resultPageHtml({
      ok: false,
      title: 'No se pudo confirmar el pago',
      message: 'Hubo un problema comunicandonos con Mercado Pago. Si el dinero fue descontado, contactanos.',
      detail: err.message,
    }));
  }

  const approved = paymentResult.status === 'approved';
  await applyPaymentResult(db, order, String(paymentId), approved, paymentResult, req.app.get('io'));

  if (approved) {
    return res.send(resultPageHtml({
      ok: true,
      title: 'Pago aprobado',
      message: `Tu compra por $${order.total.toLocaleString('es-CL')} fue confirmada. Numero de orden: ${order.buy_order}.`,
      detail: `ID de pago: ${paymentId}`,
    }));
  }

  return res.send(resultPageHtml({
    ok: false,
    title: 'Pago rechazado',
    message: 'El pago no fue aprobado. No se realizo ningun cargo. Puedes intentarlo de nuevo.',
  }));
}

// POST /api/orders/mercadopago/webhook - Mercado Pago notifica aqui en segundo plano
// (server-to-server, sin sesion del navegador) cuando un pago cambia de estado.
// Es la fuente de verdad confiable para produccion; requiere que BACKEND_PUBLIC_URL
// sea una URL real accesible desde internet (no funciona contra localhost).
async function mercadopagoWebhook(req, res) {
  const db = await getDb();
  const type = req.body?.type || req.query.type;
  const paymentId = req.body?.data?.id || req.query['data.id'];

  // Solo procesamos notificaciones de pago; respondemos 200 al resto para que
  // Mercado Pago no siga reintentando notificaciones que no usamos.
  if (type !== 'payment' || !paymentId) return res.sendStatus(200);

  let paymentResult;
  try {
    paymentResult = await mercadopago.getPayment(paymentId);
  } catch (err) {
    return res.sendStatus(200); // el retorno del navegador queda como red de respaldo
  }

  const order = paymentResult.external_reference
    ? await db.prepare('SELECT * FROM orders WHERE id = ?').get(paymentResult.external_reference)
    : null;
  if (!order) return res.sendStatus(200);

  const approved = paymentResult.status === 'approved';
  await applyPaymentResult(db, order, String(paymentId), approved, paymentResult, req.app.get('io'));

  res.sendStatus(200);
}

// PATCH /api/orders/:id/status - admin marca manualmente el resultado del pago
// coordinado por WhatsApp. body: { status: 'paid' | 'cancelled' }
async function updateOrderStatus(req, res) {
  const db = await getDb();
  const { id } = req.params;
  const { status } = req.body;

  if (!['paid', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Estado invalido. Usa "paid" o "cancelled".' });
  }

  const order = await db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'Orden no encontrada.' });
  if (['paid', 'failed', 'cancelled'].includes(order.status)) {
    return res.status(409).json({ error: `La orden ya esta en estado "${order.status}".` });
  }

  const tx = db.transaction(async (trx) => {
    if (status === 'paid') {
      const items = await getOrderItems(trx, order.id, order.items);
      for (const item of items) {
        const update = await trx.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?')
          .run(item.quantity, item.productId, item.quantity);
        if (update.changes !== 1) { const error = new Error(`Stock insuficiente para confirmar ${item.name}.`); error.status = 409; throw error; }
        await recordStockMovement(trx, { productId: item.productId, quantityDelta: -item.quantity, unitCost: item.unitCost, type: 'sale', referenceId: order.id, userId: req.user.id });
      }
    }
    await trx.prepare(`UPDATE orders SET status = ?, updated_at = ? WHERE id = ?`).run(status, nowIso(), id);
  });
  await tx();

  req.app.get('io').to('admin').emit(status === 'paid' ? 'order:paid' : 'order:failed', { orderId: order.id, buyOrder: order.buy_order });

  res.json({ message: `Orden marcada como ${status}.` });
}

// GET /api/orders/:id - el cliente dueño o el admin consultan el estado (util para polling)
async function getOrder(req, res) {
  const db = await getDb();
  const order = await db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Orden no encontrada.' });

  if (req.user.role !== 'admin') {
    const client = await db.prepare('SELECT id FROM clients WHERE user_id = ?').get(req.user.id);
    if (!client || client.id !== order.client_id) {
      return res.status(403).json({ error: 'No tienes acceso a esta orden.' });
    }
  }

  res.json({ order: { ...order, items: await getOrderItems(db, order.id, order.items) } });
}

// GET /api/orders - admin ve todas las ordenes, cliente ve las suyas
async function listOrders(req, res) {
  const db = await getDb();
  let rows;
  if (req.user.role === 'admin') {
    rows = await db.prepare(`
      SELECT o.*, u.name as client_name, u.email as client_email
      FROM orders o
      LEFT JOIN clients c ON c.id = o.client_id
      LEFT JOIN users u ON u.id = c.user_id
      ORDER BY o.created_at DESC
    `).all();
  } else {
    const client = await db.prepare('SELECT id FROM clients WHERE user_id = ?').get(req.user.id);
    rows = await db.prepare('SELECT * FROM orders WHERE client_id = ? ORDER BY created_at DESC').all(client ? client.id : 'none');
  }
  res.json({ orders: await Promise.all(rows.map(async (o) => ({ ...o, items: await getOrderItems(db, o.id, o.items) }))) });
}

module.exports = { createOrder, mercadopagoReturn, mercadopagoWebhook, updateOrderStatus, getOrder, listOrders };
