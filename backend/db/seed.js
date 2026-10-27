const { randomUUID: uuidv4 } = require('crypto');
const bcrypt = require('bcryptjs');
const getDb = require('../config/db');

async function upsertUser(db, { name, email, password, role, phone }) {
  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return existing.id;
  const id = uuidv4();
  await db.prepare(`INSERT INTO users (id, name, email, password_hash, role, phone) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, name, email, bcrypt.hashSync(password, 10), role, phone || null);
  return id;
}

async function seed() {
  const db = await getDb();
  console.log('Sembrando datos base de BARBER LINDEROS...');

  // Admin (dueño)
  await upsertUser(db, {
    name: 'Dueño Barber Linderos', email: 'admin@barberlinderos.cl', password: 'admin1234', role: 'admin',
  });

  // Servicios
  const services = [
    { name: 'Corte de cabello', price: 10000, duration_minutes: 45, description: 'Corte clásico personalizado.' },
    { name: 'Corte + barba', price: 15000, duration_minutes: 60, description: 'Corte y arreglo de barba completo.' },
    { name: 'Servicio premium', price: 18000, duration_minutes: 90, description: 'Corte + barba + limpieza facial.' },
  ];
  for (const s of services) {
    const existing = await db.prepare('SELECT id FROM services WHERE name = ?').get(s.name);
    if (!existing) {
      await db.prepare(`INSERT INTO services (id, name, price, duration_minutes, description) VALUES (?, ?, ?, ?, ?)`)
        .run(uuidv4(), s.name, s.price, s.duration_minutes, s.description);
    }
  }

  // Barberos demo
  const barbers = [
    { name: 'Diego Morales', email: 'diego@barberlinderos.cl', specialty: 'Fade' },
    { name: 'Matías Rojas', email: 'matias@barberlinderos.cl', specialty: 'Clásico' },
    { name: 'Benjamín Soto', email: 'benjamin@barberlinderos.cl', specialty: 'Diseños' },
    { name: 'Nicolás Herrera', email: 'nicolas@barberlinderos.cl', specialty: 'Barba & Premium' },
  ];
  for (const b of barbers) {
    const userId = await upsertUser(db, { name: b.name, email: b.email, password: 'barbero1234', role: 'barbero' });
    const existing = await db.prepare('SELECT id FROM barbers WHERE user_id = ?').get(userId);
    if (!existing) {
      await db.prepare(`INSERT INTO barbers (id, user_id, specialty) VALUES (?, ?, ?)`).run(uuidv4(), userId, b.specialty);
    }
  }

  // Cliente demo
  const clientUserId = await upsertUser(db, {
    name: 'Cliente Demo', email: 'cliente@barberlinderos.cl', password: 'cliente1234', role: 'cliente', phone: '+56900000000',
  });
  const existingClient = await db.prepare('SELECT id FROM clients WHERE user_id = ?').get(clientUserId);
  if (!existingClient) {
    await db.prepare(`INSERT INTO clients (id, user_id) VALUES (?, ?)`).run(uuidv4(), clientUserId);
  }

  // Inventario demo (materiales internos, no de venta)
  const items = [
    { product_name: 'Shampoo profesional', quantity: 12, min_threshold: 5 },
    { product_name: 'Cera para peinar', quantity: 8, min_threshold: 4 },
    { product_name: 'Navajas desechables', quantity: 30, min_threshold: 10 },
    { product_name: 'Toallas', quantity: 20, min_threshold: 8 },
  ];
  for (const it of items) {
    const existing = await db.prepare('SELECT id FROM inventory WHERE product_name = ?').get(it.product_name);
    if (!existing) {
      await db.prepare(`INSERT INTO inventory (id, product_name, quantity, min_threshold) VALUES (?, ?, ?, ?)`)
        .run(uuidv4(), it.product_name, it.quantity, it.min_threshold);
    }
  }

  // Catálogo de productos de venta al público (tienda)
  const products = [
    { name: 'Aceite para barba Bay Rum', description: 'Hidrata y da brillo, aroma amaderado.', price: 12990, stock: 15, category: 'Barba' },
    { name: 'Bálsamo modelador de barba', description: 'Fija y suaviza sin dejar residuo graso.', price: 10990, stock: 0, category: 'Barba' },
    { name: 'Cera mate para peinar', description: 'Fijación fuerte, acabado mate natural.', price: 8990, stock: 22, category: 'Peinado' },
    { name: 'Crema de afeitar clásica', description: 'Espuma densa para un afeitado sin irritación.', price: 9990, stock: 10, category: 'Afeitado' },
    { name: 'Shampoo anticaída', description: 'Fortalece el cuero cabelludo, uso diario.', price: 11990, stock: 18, category: 'Cabello' },
    { name: 'Kit iniciación grooming', description: 'Shampoo + cera + aceite de barba en formato viaje.', price: 21990, stock: 6, category: 'Kits' },
    { name: 'Peine de madera artesanal', description: 'Antiestático, ideal para barba y bigote.', price: 6990, stock: 0, category: 'Accesorios' },
    { name: 'Gift Card Corte + Barba', description: 'Para regalar una sesión completa en Barber Linderos.', price: 25990, stock: 999, category: 'Gift Cards' },
  ];
  for (const p of products) {
    const existing = await db.prepare('SELECT id FROM products WHERE name = ?').get(p.name);
    if (!existing) {
      await db.prepare(`
        INSERT INTO products (id, name, description, price, stock, category, active)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `).run(uuidv4(), p.name, p.description, p.price, p.stock, p.category);
    }
  }

  console.log('Seed completado.');
  console.log('--- Credenciales demo ---');
  console.log('Admin:    admin@barberlinderos.cl / admin1234');
  console.log('Barbero:  diego@barberlinderos.cl / barbero1234 (y matias/benjamin/nicolas)');
  console.log('Cliente:  cliente@barberlinderos.cl / cliente1234');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Error en seed:', err);
  process.exit(1);
});
