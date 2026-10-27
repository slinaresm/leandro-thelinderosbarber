const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/barbers.controller');
const { requireAuth, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

router.get('/', asyncHandler(ctrl.listBarbers)); // publico
router.post('/', requireAuth, requireRole('admin'), asyncHandler(ctrl.createBarber));
router.patch('/:id', requireAuth, requireRole('admin', 'barbero'), asyncHandler(ctrl.updateBarber));
router.get('/:id/clients', requireAuth, requireRole('admin', 'barbero'), asyncHandler(ctrl.getBarberClients));
router.get('/:id/stats', requireAuth, requireRole('admin', 'barbero'), asyncHandler(ctrl.getBarberStats));

module.exports = router;
