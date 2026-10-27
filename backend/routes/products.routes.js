const { validateUpload } = require('../middleware/secureUploads');
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/products.controller');
const { requireAuth, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const uploadProducts = require('../middleware/uploadProducts');

// Publico
router.get('/', asyncHandler(ctrl.listPublicProducts));

// Admin (antes de "/:id" para que "admin/all" no sea interpretado como un id)
router.get('/admin/all', requireAuth, requireRole('admin'), asyncHandler(ctrl.listAdminProducts));
router.get('/admin/inventory-summary', requireAuth, requireRole('admin'), asyncHandler(ctrl.getInventorySummary));
router.post('/', requireAuth, requireRole('admin'), uploadProducts.single('image'), validateUpload, asyncHandler(ctrl.createProduct));
router.patch('/:id', requireAuth, requireRole('admin'), uploadProducts.single('image'), validateUpload, asyncHandler(ctrl.updateProduct));
router.delete('/:id', requireAuth, requireRole('admin'), asyncHandler(ctrl.deleteProduct));

// Publico (al final: patron generico "/:id")
router.get('/:id', asyncHandler(ctrl.getProduct));

module.exports = router;
