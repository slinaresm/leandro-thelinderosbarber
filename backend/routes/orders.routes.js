const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/orders.controller');
const { requireAuth, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

// Mercado Pago redirige aqui (GET) tras el pago, y notifica aqui (POST) en
// segundo plano. Ninguna de las dos rutas lleva JWT (no es el navegador del
// cliente logueado el que llama al webhook).
router.get('/mercadopago/return', asyncHandler(ctrl.mercadopagoReturn));
router.post('/mercadopago/webhook', asyncHandler(ctrl.mercadopagoWebhook));

router.post('/', requireAuth, requireRole('cliente'), asyncHandler(ctrl.createOrder));
router.get('/', requireAuth, requireRole('admin', 'cliente'), asyncHandler(ctrl.listOrders));
router.patch('/:id/status', requireAuth, requireRole('admin'), asyncHandler(ctrl.updateOrderStatus));
router.get('/:id', requireAuth, requireRole('admin', 'cliente'), asyncHandler(ctrl.getOrder));

module.exports = router;
