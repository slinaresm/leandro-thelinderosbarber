const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/analytics.controller');
const { requireAuth, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

router.get('/overview', requireAuth, requireRole('admin'), asyncHandler(ctrl.getOverview));

module.exports = router;
