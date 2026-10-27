-- BARBER LINDEROS — Esquema Postgres (produccion)
-- Ejecutar con: npm run migrate:postgres  (usa DATABASE_URL del .env)
-- Equivalente al esquema SQLite de desarrollo (backend/config/db.js), con
-- tipos y funciones nativas de Postgres.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','barbero','cliente')),
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS barbers (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  specialty TEXT,
  photo_url TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  work_start TEXT NOT NULL DEFAULT '09:00',
  work_end TEXT NOT NULL DEFAULT '22:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  loyalty_points INTEGER NOT NULL DEFAULT 0,
  loyalty_level TEXT NOT NULL DEFAULT 'Bronce' CHECK (loyalty_level IN ('Bronce','Plata','Oro','Black')),
  birthday TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  barber_id TEXT NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL REFERENCES services(id),
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled','completed','no_show')),
  notes TEXT,
  notified_24h INTEGER NOT NULL DEFAULT 0,
  notified_2h INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
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
  request_status TEXT NOT NULL DEFAULT 'none' CHECK (request_status IN ('none','pending','approved','rejected')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS haircut_photos (
  id TEXT PRIMARY KEY,
  barber_id TEXT NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  client_id TEXT REFERENCES clients(id),
  reservation_id TEXT REFERENCES reservations(id),
  photo_url TEXT NOT NULL,
  type TEXT CHECK (type IN ('antes','despues')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  barber_id TEXT NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  client_id TEXT REFERENCES clients(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS promotions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  segment TEXT CHECK (segment IN ('nuevos','recurrentes','inactivos','vip','cumpleanos','todos')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reservation_id TEXT REFERENCES reservations(id),
  channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email','whatsapp','sms')),
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','simulated','failed')),
  read INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL,
  cost_price INTEGER,
  image_url TEXT,
  stock INTEGER NOT NULL DEFAULT 0,
  category TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_active ON products(active, price);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  client_id TEXT REFERENCES clients(id),
  buy_order TEXT UNIQUE NOT NULL,
  session_id TEXT NOT NULL,
  items TEXT NOT NULL,
  total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','cancelled')),
  webpay_token TEXT,
  mp_preference_id TEXT,
  mp_payment_id TEXT,
  payment_detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(client_id, status);

CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  supplier TEXT,
  invoice_number TEXT,
  invoice_file_url TEXT,
  items TEXT NOT NULL,
  total_cost INTEGER NOT NULL,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orders_buy_order ON orders(buy_order);
