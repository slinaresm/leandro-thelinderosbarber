// Timestamp portable entre SQLite y Postgres: en vez de confiar en funciones
// de fecha propias de cada motor (datetime('now') vs now()), calculamos el
// valor en JS y lo pasamos como parametro. Funciona igual en ambos drivers.
function nowIso() {
  return new Date().toISOString();
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoDate(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function daysAgoIso(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

module.exports = { nowIso, todayDate, daysAgoDate, daysAgoIso };
