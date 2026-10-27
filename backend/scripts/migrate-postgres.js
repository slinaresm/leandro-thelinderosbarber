// Aplica migraciones versionadas de PostgreSQL. Nunca edita una base productiva
// manualmente: cada archivo se registra en schema_migrations al completarse.
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Falta DATABASE_URL en el .env. Ejemplo:');
    console.error('DATABASE_URL=postgres://usuario:password@localhost:5432/barber_linderos');
    process.exit(1);
  }

  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const migrations = [
    { version: '000_initial_schema', file: 'schema.postgres.sql' },
    ...fs.readdirSync(migrationsDir).filter(file => /^\d+_.+\.sql$/.test(file)).sort().map(file => ({ version: path.basename(file, '.sql'), file })),
  ];

  const pool = new Pool({
    connectionString,
    ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  for (const migration of migrations) {
    const applied = await pool.query('SELECT 1 FROM schema_migrations WHERE version = $1', [migration.version]);
    if (applied.rowCount) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, migration.file), 'utf8');
    console.log(`Aplicando ${migration.file}...`);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [migration.version]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally { client.release(); }
  }
  console.log('Migraciones aplicadas correctamente. Ahora puedes correr: DB_DRIVER=postgres npm run seed');
  await pool.end();
}

main().catch((err) => {
  console.error('Error aplicando migracion:', err.message);
  process.exit(1);
});
