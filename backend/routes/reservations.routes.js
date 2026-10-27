const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/reservations.controller');
const { requireAuth, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

router.get('/availability', asyncHandler(ctrl.getAvailability)); // publico
router.get('/', requireAuth, asyncHandler(ctrl.listReservations));
router.post('/', requireAuth, requireRole('cliente'), asyncHandler(ctrl.createReservation));
router.patch('/:id/cancel', requireAuth, asyncHandler(ctrl.cancelReservation));
router.patch('/:id/reschedule', requireAuth, asyncHandler(ctrl.rescheduleReservation));
router.patch('/:id/complete', requireAuth, requireRole('admin', 'barbero'), asyncHandler(ctrl.completeReservation));

module.exports = router;
