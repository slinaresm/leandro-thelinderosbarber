function validateAuth(kind) {
  return (req, res, next) => {
    const { email, password, name, phone } = req.body || {};
    if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || typeof password !== 'string' || !password || Buffer.byteLength(password,'utf8') > 72) return res.status(400).json({ error: 'Email o contraseña no válidos.' });
    if (kind === 'register' && (typeof name !== 'string' || name.trim().length < 2 || name.length > 100 || /[<>]/.test(name) || password.length < 12 || (phone != null && (typeof phone !== 'string' || !/^[\d +()\-]{0,32}$/.test(phone))))) return res.status(400).json({ error: 'Usa un nombre válido y una contraseña de al menos 12 caracteres; el teléfono debe ser válido.' });
    req.body.email = email.trim().toLowerCase();
    if (kind === 'register') req.body.name = name.trim();
    next();
  };
}
module.exports = { validateAuth };
