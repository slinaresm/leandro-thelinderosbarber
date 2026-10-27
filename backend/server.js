const path = require('path');
const express = require('express');
const cookie = require('cookie');
const { installSecurity, allowedOrigin } = require('./middleware/security');
const { installPages } = require('./web');
const http = require('http');
const { Server } = require('socket.io');

const { PORT, DB_DRIVER, UPLOADS_DIR } = require('./config/env');
const { verifyToken } = require('./utils/jwt');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { startScheduler } = require('./services/scheduler.service');

const authRoutes = require('./routes/auth.routes');
const servicesRoutes = require('./routes/services.routes');
const barbersRoutes = require('./routes/barbers.routes');
const clientsRoutes = require('./routes/clients.routes');
const reservationsRoutes = require('./routes/reservations.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const notesRoutes = require('./routes/notes.routes');
const promotionsRoutes = require('./routes/promotions.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const photosRoutes = require('./routes/photos.routes');
const configRoutes = require('./routes/config.routes');
const productsRoutes = require('./routes/products.routes');
const ordersRoutes = require('./routes/orders.routes');
const purchasesRoutes = require('./routes/purchases.routes');
const assistantRoutes = require('./routes/assistant.routes');

const app = express();
installSecurity(app);
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
require('./middleware/secureUploads').installUploads(app, express, path.join(__dirname, UPLOADS_DIR));

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'BARBER LINDEROS API', dbDriver: DB_DRIVER }));

app.use('/api/auth', authRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/barbers', barbersRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/reservations', reservationsRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/promotions', promotionsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/photos', photosRoutes);
app.use('/api/config', configRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/purchases', purchasesRoutes);
app.use('/api/assistant', assistantRoutes);

installPages(app);
app.use(notFound);
app.use(errorHandler);

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: (origin, cb) => cb(null, allowedOrigin(origin)), credentials: true }, allowRequest: (req, cb) => cb(null, allowedOrigin(req.headers.origin)) });
app.set('io', io);

// Autenticacion de socket via JWT (opcional: publico puede conectarse solo para ver disponibilidad)
io.use((socket, next) => {
  const token = cookie.parseCookie(socket.request.headers.cookie || '').bl_session || socket.handshake.auth?.token;
  if (token) {
    try {
      socket.user = verifyToken(token);
    } catch (e) {
      return next(new Error('Sesión inválida.'));
    }
  }
  next();
});

io.on('connection', (socket) => {
  if (socket.user?.role === 'admin') {
    socket.join('admin');
  }
  if (socket.user?.role === 'barbero') {
    socket.join(`barberUser:${socket.user.barberId || 'unknown'}`);
  }

  // El cliente (o cualquier visitante) se une a la sala de un barbero+fecha para ver disponibilidad en vivo
  socket.on('joinBarberDate', ({ barberId, date } = {}) => {
    if (barberId && date) socket.join(`barber:${barberId}:${date}`);
  });

  socket.on('leaveBarberDate', ({ barberId, date } = {}) => {
    if (barberId && date) socket.leave(`barber:${barberId}:${date}`);
  });
});

if (require.main === module) server.listen(PORT, () => {
  console.log(`BARBER LINDEROS API escuchando en http://localhost:${PORT} (DB: ${DB_DRIVER})`);
  startScheduler();
});

module.exports = { app, server, io };
