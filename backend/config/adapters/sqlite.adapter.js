const { DatabaseSync } = require('node:sqlite');

// Adaptador SQLite (node:sqlite nativo, sin compilacion). Uso recomendado para
// desarrollo local. La API es sincrona por naturaleza, pero se expone envuelta
// en promesas resueltas para que el resto del backend pueda usar await de forma
// identica sin importar el driver (SQLite en dev, Postgres en produccion).
function createSqliteAdapter({ filePath }) {
  const raw = new DatabaseSync(filePath);
  raw.exec('PRAGMA journal_mode = WAL;');
  raw.exec('PRAGMA foreign_keys = ON;');

  function prepare(sql) {
    const stmt = raw.prepare(sql);
    return {
      get: (...params) => Promise.resolve(stmt.get(...params)),
      all: (...params) => Promise.resolve(stmt.all(...params)),
      run: (...params) => {
        const info = stmt.run(...params);
        return Promise.resolve({ changes: info.changes, lastInsertRowid: info.lastInsertRowid });
      },
    };
  }

  function exec(sql) {
    raw.exec(sql);
    return Promise.resolve();
  }

  function transaction(fn) {
    // SQLite es de conexion unica, asi que el "trxDb" es la misma interfaz:
    // se mantiene por consistencia con el adaptador Postgres, donde si importa
    // usar una conexion dedicada.
    return async (...args) => {
      raw.exec('BEGIN');
      try {
        const result = await fn(adapter, ...args);
        raw.exec('COMMIT');
        return result;
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      }
    };
  }

  async function close() {
    raw.close();
  }

  const adapter = { driver: 'sqlite', prepare, exec, transaction, close };
  return adapter;
}

module.exports = { createSqliteAdapter };
