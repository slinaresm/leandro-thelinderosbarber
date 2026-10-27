const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/services.controller');
const { requireAuth, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

router.get('/', asyncHandler(ctrl.listServices)); // publico: cliente necesita verlos para reservar
router.post('/', requireAuth, requireRole('admin'), asyncHandler(ctrl.createService));
router.patch('/:id', requireAuth, requireRole('admin'), asyncHandler(ctrl.updateService));
router.delete('/:id', requireAuth, requireRole('admin'), asyncHandler(ctrl.deleteService));

module.exports = router;
