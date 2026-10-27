const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/promotions.controller');
const { requireAuth, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

router.get('/', requireAuth, requireRole('admin'), asyncHandler(ctrl.listPromotions));
router.post('/', requireAuth, requireRole('admin'), asyncHandler(ctrl.createPromotion));
router.patch('/:id', requireAuth, requireRole('admin'), asyncHandler(ctrl.updatePromotion));
router.get('/segments/counts', requireAuth, requireRole('admin'), asyncHandler(ctrl.getSegmentCounts));

module.exports = router;
