const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict'),mysql=require('mysql2/promise');
const root=path.resolve(__dirname,'../../..');
async function main(){
  const credentials=JSON.parse(fs.readFileSync(path.join(root,'.refactor-data/runtime/mariadb.connection.json')));
  assert.equal(credentials.host,'127.0.0.1');assert.equal(credentials.port,33386);
  const db=await mysql.createConnection(credentials);
  const work=path.join(root,'.refactor-data/db-preflight-native-'+crypto.randomBytes(5).toString('hex'));
  fs.mkdirSync(path.join(work,'api'),{recursive:true});
  const php=path.join(root,'.refactor-data/runtime/php84/php.exe'),archive=path.join(work,'rf017-db-preflight.phar');
  const build=cp.spawnSync(php,['-d','phar.readonly=0','tools/refactor/hosting/build-db-preflight.php',archive],{cwd:root,encoding:'utf8',windowsHide:true});assert.equal(build.status,0,build.stderr);
  const run=()=>{const result=cp.spawnSync(php,[archive],{encoding:'utf8',windowsHide:true});assert(!result.stderr,'No emitir errores crudos');assert(!result.stdout.includes(password),'No revelar contraseña');return {exit:result.status,body:JSON.parse(result.stdout)};};
  const password=crypto.randomBytes(24).toString('hex')+' # $ !';
  let count=0;
  try{
    const [[version]]=await db.query('SELECT VERSION() AS version');assert(/^10\.6\.28-MariaDB/.test(version.version));
    await db.query('CREATE DATABASE leakmcl_linderos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_nopad_ci');
    await db.query("CREATE USER 'leakmcl_linderos_usr'@'localhost' IDENTIFIED BY ?",[password]);
    await db.query("GRANT SELECT ON leakmcl_linderos.* TO 'leakmcl_linderos_usr'@'localhost'");
    await db.query('CREATE TABLE leakmcl_linderos.read_only_sentinel (id INT PRIMARY KEY, value INT)');
    await db.query('INSERT INTO leakmcl_linderos.read_only_sentinel VALUES (1,17)');
    const missing=run();assert.equal(missing.body.code,'PRIVATE_ENV_MISSING');count++;
    const template=fs.readFileSync(path.join(root,'docs/refactor/hosting/production.env.example'),'utf8');
    const environment=template.replace('DB_HOST=localhost','DB_HOST=127.0.0.1').replace('DB_PORT=3306','DB_PORT=33386').replace('DB_PASSWORD=',"DB_PASSWORD='"+password+"'");
    const envFile=path.join(work,'api/.env');fs.writeFileSync(envFile,environment,{mode:0o600});
    const valid=run();assert.equal(valid.exit,0);assert.equal(valid.body.status,'passed');assert.equal(valid.body.tableCount,1);assert.equal(valid.body.persistentWrites,0);assert.equal(valid.body.applicationSchemaVerified,false);count++;
    fs.writeFileSync(envFile,environment.replace(password,'incorrect-synthetic-password'));assert.equal(run().body.code,'DATABASE_AUTHENTICATION_FAILED');count++;
    fs.writeFileSync(envFile,environment.replace("DB_PASSWORD='"+password+"'","DB_PASSWORD='unterminated"));assert.equal(run().body.code,'PRIVATE_ENV_OR_RUNTIME_INVALID');count++;
    fs.writeFileSync(envFile,environment.replace('DB_DATABASE=leakmcl_linderos','DB_DATABASE=other'));assert.equal(run().body.code,'DATABASE_CONFIGURATION_INVALID');count++;
    const [[sentinel]]=await db.query('SELECT value FROM leakmcl_linderos.read_only_sentinel WHERE id=1');assert.equal(sentinel.value,17);count++;
    fs.writeFileSync(path.join(root,'docs/refactor/evidencia/RF-017-db-diagnostico-local.json'),JSON.stringify({date:'2026-10-30',scope:'MariaDB local real, usuario con SELECT únicamente; no prueba hosting',checks:count,status:'passed',packagedDotenv:true,specialCharactersParsed:true,secretsRedacted:true,sentinelUnchanged:true},null,2)+'\n');
    console.log(count+' comprobaciones aprobadas: MariaDB real, lector dotenv de la API, solo lectura y errores sin claves.');
  }finally{await db.end();}
}
main().catch(error=>{console.error(error.code||error.message);process.exitCode=1;});
