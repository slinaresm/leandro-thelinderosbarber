const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/notes.controller');
const { requireAuth, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

router.post('/', requireAuth, requireRole('barbero'), asyncHandler(ctrl.createNote));
router.get('/', requireAuth, requireRole('barbero'), asyncHandler(ctrl.listNotes));

module.exports = router;
