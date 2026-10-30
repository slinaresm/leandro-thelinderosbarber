const path = require('node:path');
const assert = require('node:assert/strict');
const engine = process.env.RF_SQL_ENGINE || 'mysql';
assert(['mysql', 'mariadb'].includes(engine), 'RF_SQL_ENGINE inválido');
const maria = engine === 'mariadb';
const root = path.resolve(__dirname, '../..');
const collation = maria ? 'utf8mb4_unicode_520_nopad_ci' : 'utf8mb4_0900_ai_ci';
const connectionFile = process.env.MYSQL_CONNECTION_FILE || path.join(root, '.refactor-data/runtime/' + engine + '.connection.json');
function assertVersion(version) {
  assert(maria ? /^10\.6\.(\d+).*MariaDB/i.test(version) && Number(/^10\.6\.(\d+)/.exec(version)[1]) >= 28 : /^8\.4\./.test(version) && !/mariadb/i.test(version), 'DATABASE_VERSION_UNSUPPORTED');
}
const report = name => maria ? name.replace(/\.json$/, '-mariadb.json') : name;
module.exports = { engine, maria, collation, connectionFile, assertVersion, report, label: maria ? 'MariaDB 10.6.28 real' : 'MySQL 8.4 real' };
