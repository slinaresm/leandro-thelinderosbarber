const { Pool } = require('pg');

// Adaptador Postgres (driver puro JS, sin compilacion nativa) para produccion.
// Traduce placeholders estilo SQLite ('?') a placeholders de Postgres ($1, $2...)
// para que el resto del backend no tenga que mantener dos dialectos de SQL a mano.
function qmarksToDollar(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function wrapRunner(runnerQuery) {
  return function prepare(sql) {
    const pgSql = qmarksToDollar(sql);
    return {
      get: async (...params) => {
        const res = await runnerQuery(pgSql, params);
        return res.rows[0];
      },
      all: async (...params) => {
        const res = await runnerQuery(pgSql, params);
        return res.rows;
      },
      run: async (...params) => {
        const res = await runnerQuery(pgSql, params);
        return { changes: res.rowCount, lastInsertRowid: null };
      },
    };
  };
}

function createPostgresAdapter({ connectionString, ssl }) {
  const pool = new Pool({ connectionString, ssl });
  const prepare = wrapRunner((sql, params) => pool.query(sql, params));

  async function exec(sql) {
    await pool.query(sql);
  }

  // Cada transaccion toma su propia conexion dedicada del pool, evitando
  // que transacciones concurrentes se pisen entre si (a diferencia de un
  // monkeypatch global sobre el pool).
  function transaction(fn) {
    return async (...args) => {
      const client = await pool.connect();
      const trxPrepare = wrapRunner((sql, params) => client.query(sql, params));
      const trxDb = {
        driver: 'postgres',
        prepare: trxPrepare,
        exec: (sql) => client.query(sql),
      };
      try {
        await client.query('BEGIN');
        const result = await fn(trxDb, ...args);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    };
  }

  async function close() {
    await pool.end();
  }

  return { driver: 'postgres', prepare, exec, transaction, close, _pool: pool };
}

module.exports = { createPostgresAdapter, qmarksToDollar };
