// Aplica backend/migrations/schema.postgres.sql contra la base definida en
// DATABASE_URL. Uso: npm run migrate:postgres
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

  const sqlPath = path.join(__dirname, '..', 'migrations', 'schema.postgres.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const pool = new Pool({
    connectionString,
    ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  console.log('Aplicando esquema a Postgres...');
  await pool.query(sql);
  console.log('Esquema aplicado correctamente. Ahora puedes correr: DB_DRIVER=postgres npm run seed');
  await pool.end();
}

main().catch((err) => {
  console.error('Error aplicando migracion:', err.message);
  process.exit(1);
});
