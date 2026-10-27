const { issueSession } = require('../middleware/security');
const { randomUUID: uuidv4 } = require('crypto');
const bcrypt = require('bcryptjs');
const getDb = require('../config/db');
const { signToken } = require('../utils/jwt');
const { sendWelcomeEmail } = require('../services/notifications.service');

// POST /api/auth/register  (para clientes que se auto-registran; admin/barbero se crean via panel admin)
async function register(req, res) {
  const db = await getDb();
  const { name, email, password, phone } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nombre, email y contrasena son obligatorios.' });
  }

  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: 'Ya existe una cuenta con ese email.' });
  }

  const userId = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);

  await db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role, phone)
    VALUES (?, ?, ?, ?, 'cliente', ?)
  `).run(userId, name, email, passwordHash, phone || null);

  const clientId = uuidv4();
  await db.prepare(`INSERT INTO clients (id, user_id) VALUES (?, ?)`).run(clientId, userId);

  const token = signToken({ id: userId, role: 'cliente', name, email, clientId, barberId: null });

  sendWelcomeEmail({ to: email, name }).catch(() => {});

  issueSession(res, token);
  res.status(201).json({
    user: { id: userId, name, email, role: 'cliente', clientId },
  });
}

// POST /api/auth/login
async function login(req, res) {
  const db = await getDb();
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contrasena son obligatorios.' });
  }

  const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Credenciales invalidas.' });
  }

  let extra = {};
  if (user.role === 'barbero') {
    const barber = await db.prepare('SELECT id, specialty FROM barbers WHERE user_id = ?').get(user.id);
    extra.barberId = barber ? barber.id : null;
    extra.specialty = barber ? barber.specialty : null;
  } else if (user.role === 'cliente') {
    const client = await db.prepare('SELECT id, loyalty_points, loyalty_level FROM clients WHERE user_id = ?').get(user.id);
    extra.clientId = client ? client.id : null;
    extra.loyaltyPoints = client ? client.loyalty_points : 0;
    extra.loyaltyLevel = client ? client.loyalty_level : 'Bronce';
  }

  const token = signToken({
    id: user.id, role: user.role, name: user.name, email: user.email,
    barberId: extra.barberId || null, clientId: extra.clientId || null,
  });
  issueSession(res, token);
  res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role, ...extra },
  });
}

// GET /api/auth/me
async function me(req, res) {
  const db = await getDb();
  const user = await db.prepare('SELECT id, name, email, role, phone FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
  res.json({ user });
}

module.exports = { register, login, me };
