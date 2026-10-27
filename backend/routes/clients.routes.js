const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/clients.controller');
const { requireAuth, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

router.get('/', requireAuth, requireRole('admin'), asyncHandler(ctrl.listClients));
router.get('/:id', requireAuth, requireRole('admin', 'cliente'), asyncHandler(ctrl.getClient));
router.get('/:id/history', requireAuth, requireRole('admin', 'cliente', 'barbero'), asyncHandler(ctrl.getClientHistory));

module.exports = router;
