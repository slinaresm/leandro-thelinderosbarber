const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/assistant.controller');
const asyncHandler = require('../middleware/asyncHandler');

router.post('/chat', asyncHandler(ctrl.chat));

module.exports = router;
