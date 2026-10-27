const path = require('path');
const { DB_DRIVER, DATABASE_URL, PG_SSL } = require('./env');

const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','barbero','cliente')),
  phone TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS barbers (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  specialty TEXT,
  photo_url TEXT,
  active INTEGER DEFAULT 1,
  work_start TEXT DEFAULT '09:00',
  work_end TEXT DEFAULT '22:00',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  loyalty_points INTEGER DEFAULT 0,
  loyalty_level TEXT DEFAULT 'Bronce' CHECK(loyalty_level IN ('Bronce','Plata','Oro','Black')),
  birthday TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL,
  description TEXT,
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  barber_id TEXT NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL REFERENCES services(id),
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','cancelled','completed','no_show')),
  notes TEXT,
  notified_24h INTEGER DEFAULT 0,
  notified_2h INTEGER DEFAULT 0,
  service_name_snapshot TEXT,
  service_price_snapshot INTEGER,
  service_duration_snapshot INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reservations_barber_date ON reservations(barber_id, date, status);
CREATE INDEX IF NOT EXISTS idx_reservations_client ON reservations(client_id, status);
CREATE INDEX IF NOT EXISTS idx_reservations_reminders ON reservations(status, date, notified_24h, notified_2h);

CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  min_threshold INTEGER NOT NULL DEFAULT 5,
  requested_by TEXT REFERENCES barbers(id),
  request_status TEXT DEFAULT 'none' CHECK(request_status IN ('none','pending','approved','rejected')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS haircut_photos (
  id TEXT PRIMARY KEY,
  barber_id TEXT NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  client_id TEXT REFERENCES clients(id),
  reservation_id TEXT REFERENCES reservations(id),
  photo_url TEXT NOT NULL,
  type TEXT CHECK(type IN ('antes','despues')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  barber_id TEXT NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  client_id TEXT REFERENCES clients(id),
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS promotions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  segment TEXT CHECK(segment IN ('nuevos','recurrentes','inactivos','vip','cumpleanos','todos')),
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reservation_id TEXT REFERENCES reservations(id),
  channel TEXT NOT NULL DEFAULT 'email' CHECK(channel IN ('email','whatsapp','sms')),
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK(status IN ('sent','simulated','failed')),
  read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL,
  image_url TEXT,
  stock INTEGER NOT NULL DEFAULT 0,
  category TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_active ON products(active, price);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  client_id TEXT REFERENCES clients(id),
  buy_order TEXT UNIQUE NOT NULL,
  session_id TEXT NOT NULL,
  items TEXT NOT NULL,
  total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','failed','cancelled')),
  mp_preference_id TEXT,
  mp_payment_id TEXT,
  payment_detail TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  product_id TEXT REFERENCES products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  unit_price INTEGER NOT NULL CHECK(unit_price >= 0),
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  unit_cost INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);

CREATE TABLE IF NOT EXISTS purchase_items (
  id TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE RESTRICT,
  product_id TEXT REFERENCES products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  unit_cost INTEGER NOT NULL CHECK(unit_cost >= 0),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK(movement_type IN ('purchase','sale','adjustment','return','waste')),
  quantity_delta INTEGER NOT NULL,
  unit_cost INTEGER,
  reference_type TEXT,
  reference_id TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_created ON stock_movements(product_id, created_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_data TEXT,
  after_data TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id, created_at);

CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(client_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_buy_order ON orders(buy_order);

CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  supplier TEXT,
  invoice_number TEXT,
  invoice_file_url TEXT,
  items TEXT NOT NULL,
  total_cost INTEGER NOT NULL,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);
`;

let dbPromise = null;

async function initDb() {
  if (DB_DRIVER === 'postgres') {
    const { createPostgresAdapter } = require('./adapters/postgres.adapter');
    const adapter = createPostgresAdapter({ connectionString: DATABASE_URL, ssl: PG_SSL });
    // En Postgres el esquema se aplica con `npm run migrate:postgres`
    // (ver backend/migrations/schema.postgres.sql), no en cada arranque.
    return adapter;
  }

  const { createSqliteAdapter } = require('./adapters/sqlite.adapter');
  const filePath = process.env.SQLITE_FILE || path.join(__dirname, '..', 'db', 'barberlinderos.sqlite');
  const adapter = createSqliteAdapter({ filePath });
  await adapter.exec(SQLITE_SCHEMA);

  // Migracion idempotente: agrega columnas nuevas a bases de datos que ya
  // existian antes de este cambio (CREATE TABLE IF NOT EXISTS no las agrega).
  for (const stmt of [
    `ALTER TABLE barbers ADD COLUMN work_start TEXT DEFAULT '09:00'`,
    `ALTER TABLE barbers ADD COLUMN work_end TEXT DEFAULT '22:00'`,
    `ALTER TABLE products ADD COLUMN cost_price INTEGER`,
    `ALTER TABLE orders ADD COLUMN mp_preference_id TEXT`,
    `ALTER TABLE orders ADD COLUMN mp_payment_id TEXT`,
    `ALTER TABLE reservations ADD COLUMN service_name_snapshot TEXT`,
    `ALTER TABLE reservations ADD COLUMN service_price_snapshot INTEGER`,
    `ALTER TABLE reservations ADD COLUMN service_duration_snapshot INTEGER`,
  ]) {
    try { await adapter.exec(stmt); } catch (e) { /* la columna ya existe */ }
  }

  return adapter;
}

// Se expone una promesa unica compartida: todo el backend hace
// `const db = await require('../config/db')` para obtener la instancia lista,
// sin importar si el driver activo es sqlite o postgres.
function getDb() {
  if (!dbPromise) dbPromise = initDb();
  return dbPromise;
}

module.exports = getDb;
module.exports.SQLITE_SCHEMA = SQLITE_SCHEMA;
