const { validateUpload } = require('../middleware/secureUploads');
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/photos.controller');
const { requireAuth, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const upload = require('../middleware/upload');

router.post('/', requireAuth, requireRole('barbero'), upload.single('photo'), validateUpload, asyncHandler(ctrl.uploadPhoto));
router.get('/', requireAuth, asyncHandler(ctrl.listPhotos));
router.delete('/:id', requireAuth, requireRole('admin', 'barbero'), asyncHandler(ctrl.deletePhoto));

module.exports = router;
