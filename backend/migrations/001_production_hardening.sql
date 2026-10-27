-- Production hardening. This migration is safe to run after schema.postgres.sql.
CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_ci_active ON users (lower(email)) WHERE deleted_at IS NULL;

ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_preference_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_payment_id TEXT;
DO $$ BEGIN ALTER TABLE products ADD CONSTRAINT products_price_nonnegative CHECK (price >= 0) NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE products ADD CONSTRAINT products_stock_nonnegative CHECK (stock >= 0) NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE services ADD CONSTRAINT services_price_nonnegative CHECK (price >= 0) NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE services ADD CONSTRAINT services_duration_positive CHECK (duration_minutes > 0) NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE reservations ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS service_name_snapshot TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS service_price_snapshot INTEGER;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS service_duration_snapshot INTEGER;
UPDATE reservations r SET
  starts_at = ((r.date::date + r.start_time::time) AT TIME ZONE 'America/Santiago'),
  ends_at = ((r.date::date + r.end_time::time) AT TIME ZONE 'America/Santiago'),
  service_name_snapshot = COALESCE(r.service_name_snapshot, s.name),
  service_price_snapshot = COALESCE(r.service_price_snapshot, s.price),
  service_duration_snapshot = COALESCE(r.service_duration_snapshot, s.duration_minutes)
FROM services s WHERE r.service_id = s.id;

CREATE OR REPLACE FUNCTION sync_reservation_times() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.starts_at := ((NEW.date::date + NEW.start_time::time) AT TIME ZONE 'America/Santiago');
  NEW.ends_at := ((NEW.date::date + NEW.end_time::time) AT TIME ZONE 'America/Santiago');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS reservations_sync_times ON reservations;
CREATE TRIGGER reservations_sync_times BEFORE INSERT OR UPDATE OF date, start_time, end_time ON reservations FOR EACH ROW EXECUTE FUNCTION sync_reservation_times();
CREATE INDEX IF NOT EXISTS idx_reservations_barber_starts_at ON reservations(barber_id, starts_at);
DO $$ BEGIN
  ALTER TABLE reservations ADD CONSTRAINT reservations_no_overlap
    EXCLUDE USING gist (barber_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
    WHERE (status = 'confirmed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS products_set_updated_at ON products;
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS orders_set_updated_at ON orders;
CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS reservations_set_updated_at ON reservations;
CREATE TRIGGER reservations_set_updated_at BEFORE UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE inventory ADD COLUMN IF NOT EXISTS product_id TEXT REFERENCES products(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_product ON inventory(product_id) WHERE product_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  product_id TEXT REFERENCES products(id) ON DELETE RESTRICT, product_name TEXT NOT NULL,
  unit_price INTEGER NOT NULL CHECK(unit_price >= 0), quantity INTEGER NOT NULL CHECK(quantity > 0),
  unit_cost INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);

CREATE TABLE IF NOT EXISTS purchase_items (
  id TEXT PRIMARY KEY, purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE RESTRICT,
  product_id TEXT REFERENCES products(id) ON DELETE RESTRICT, product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity > 0), unit_cost INTEGER NOT NULL CHECK(unit_cost >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK(movement_type IN ('purchase','sale','adjustment','return','waste')),
  quantity_delta INTEGER NOT NULL, unit_cost INTEGER, reference_type TEXT, reference_id TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL, note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_created ON stock_movements(product_id, created_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY, actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL,
  before_data JSONB, after_data JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id, created_at);
