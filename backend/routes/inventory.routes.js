const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/inventory.controller');
const { requireAuth, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

router.get('/', requireAuth, requireRole('admin', 'barbero'), asyncHandler(ctrl.listInventory));
router.post('/', requireAuth, requireRole('admin'), asyncHandler(ctrl.createItem));
router.patch('/:id', requireAuth, requireRole('admin'), asyncHandler(ctrl.updateItem));
router.post('/:id/request', requireAuth, requireRole('barbero'), asyncHandler(ctrl.requestRestock));

module.exports = router;
