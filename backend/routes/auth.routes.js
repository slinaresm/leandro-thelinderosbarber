const { validateAuth } = require('../middleware/validateAuth');
const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

router.post('/register', validateAuth('register'), asyncHandler(authController.register));
router.post('/login', validateAuth('login'), asyncHandler(authController.login));
router.post('/logout', (req, res) => { require('../middleware/security').clearSession(res); res.status(204).end(); });
router.get('/me', requireAuth, asyncHandler(authController.me));

module.exports = router;
