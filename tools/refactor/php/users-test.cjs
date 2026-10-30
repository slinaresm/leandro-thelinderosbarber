const sqlProfile=require('../sql-profile.cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const mysql=require('mysql2/promise');const root=path.resolve(__dirname,'../../..');
async function main(){
  assert(!fs.existsSync(path.join(root,'api/bootstrap/cache/config.php')),'Limpiar configuración cacheada de api antes del ensayo.');
  const php=process.env.PHP_BINARY||path.join(root,'.refactor-data/runtime/php84/php.exe');
  process.env.MYSQL_CONNECTION_FILE=process.env.MYSQL_CONNECTION_FILE||sqlProfile.connectionFile;
  const credentials=JSON.parse(fs.readFileSync(process.env.MYSQL_CONNECTION_FILE,'utf8'));
  assert(['127.0.0.1','localhost'].includes(credentials.host),'El ensayo requiere un servidor local explícito.');
  const database='rf023_test_'+crypto.randomBytes(5).toString('hex');const c=await mysql.createConnection(credentials);await c.query('CREATE DATABASE `'+database+'` CHARACTER SET utf8mb4 COLLATE '+sqlProfile.collation+'');await c.end();
  const work=path.join(root,'.refactor-data',database);fs.mkdirSync(work,{recursive:true});
  const overrides={BUSINESS_FILES_ROOT:path.join(work,'images'),APP_ENV:'testing',APP_DEBUG:'false',APP_KEY:'base64:'+crypto.randomBytes(32).toString('base64'),APP_URL:'http://localhost:8080',SITE_ORIGIN:'http://localhost:8080',DB_URL:'',DB_SOCKET:'',DB_CACHE_CONNECTION:sqlProfile.engine,DB_CACHE_TABLE:'cache',DB_CACHE_LOCK_CONNECTION:sqlProfile.engine,DB_CACHE_LOCK_TABLE:'cache_locks',DB_CONNECTION:sqlProfile.engine,DB_HOST:credentials.host,DB_PORT:String(credentials.port),DB_DATABASE:database,DB_USERNAME:credentials.user,DB_PASSWORD:credentials.password,CACHE_STORE:'database',JWT_ACTIVE_KID:'test-1',JWT_KEYS:JSON.stringify({'test-1':crypto.randomBytes(48).toString('base64'),'old-key':crypto.randomBytes(48).toString('base64')}),JWT_ISSUER:'barber-linderos',JWT_AUDIENCE:'barber-linderos-web'};
  const env={...process.env,...overrides};
  fs.writeFileSync(path.join(work,'environment.json'),JSON.stringify(overrides),{mode:0o600}); // solo variables de este ensayo; nunca se adjunta a docs
  const run=(args,extra={})=>{const result=cp.spawnSync(php,args,{cwd:path.join(root,'api'),env:{...env,...extra},encoding:'utf8',windowsHide:true});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');assert.equal(result.status,0,'Falló PHP: '+args.join(' '));return result;};
  run(['artisan','migrate','--force','--no-interaction']);run(['artisan','migrate','--force','--no-interaction']);
  run(['vendor/phpunit/phpunit/phpunit','tests/Feature/AdminUserManagementTest.php','--log-junit',path.join(work,'junit.xml')]);
  const xml=fs.readFileSync(path.join(work,'junit.xml'),'utf8');const suite=/<testsuite name="[^"]+"[^>]*tests="(\d+)"[^>]*assertions="(\d+)"/.exec(xml);
  fs.writeFileSync(path.join(root,'docs/refactor/evidencia/'+sqlProfile.report('RF-023-api-pruebas.json')),JSON.stringify({date:new Date().toISOString().slice(0,10),engine:sqlProfile.label,php:cp.spawnSync(php,['-r','echo PHP_VERSION;'],{encoding:'utf8'}).stdout,database,tests:suite?Number(suite[1]):null,assertions:suite?Number(suite[2]):null,status:'passed',junitPrivate:true},null,2)+'\n');
  console.log('RF-023 API aprobada; configuración privada en '+path.relative(root,work));
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
