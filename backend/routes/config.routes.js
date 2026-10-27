const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/config.controller');
const asyncHandler = require('../middleware/asyncHandler');

router.get('/', asyncHandler(ctrl.getPublicConfig));

module.exports = router;
