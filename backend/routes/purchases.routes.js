const { validateUpload } = require('../middleware/secureUploads');
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/purchases.controller');
const { requireAuth, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const uploadInvoices = require('../middleware/uploadInvoices');

router.get('/', requireAuth, requireRole('admin'), asyncHandler(ctrl.listPurchases));
router.post('/extract', requireAuth, requireRole('admin'), uploadInvoices.single('invoice'), validateUpload, asyncHandler(ctrl.extractInvoice));
router.post('/confirm', requireAuth, requireRole('admin'), asyncHandler(ctrl.confirmPurchase));

module.exports = router;
