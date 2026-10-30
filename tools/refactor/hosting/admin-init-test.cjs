const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),mysql=require('mysql2/promise');
const root=path.resolve(__dirname,'../../..');
async function main(){
  const credentials=JSON.parse(fs.readFileSync(path.join(root,'.refactor-data/runtime/mariadb.connection.json')));assert.equal(credentials.host,'127.0.0.1');assert.equal(credentials.port,33386);
  const parent=path.join(root,'.refactor-data');const candidates=fs.readdirSync(parent).filter(name=>name.startsWith('rf017_private_install_')).sort((a,b)=>fs.statSync(path.join(parent,b)).mtimeMs-fs.statSync(path.join(parent,a)).mtimeMs);
  const work=path.join(parent,candidates[0]),release=path.join(work,'release'),env=fs.readFileSync(path.join(release,'api/.env'),'utf8'),database=/^DB_DATABASE=(.+)$/m.exec(env)[1].trim();assert(/^rf017_install_[a-f0-9]+$/.test(database));
  const db=await mysql.createConnection({...credentials,database});const php=path.join(root,'.refactor-data/runtime/php84/php.exe');
  try{
    const [[before]]=await db.query('SELECT COUNT(*) AS n FROM users');assert.equal(Number(before.n),process.argv.includes('--reuse-fixture')?1:0,'El fixture no corresponde al caso esperado.');
    if(process.argv.includes('--reuse-fixture')){const receipt=path.join(release,'rf017-admin-result.json');fs.renameSync(receipt,receipt+'.before-retry');}
    let source=fs.readFileSync(path.join(root,'tools/refactor/hosting/admin-init.php'),'utf8').replaceAll('leakmcl_linderos',database).replaceAll('/home/leakmcl/apps/linderosbarber-data',path.join(work,'data').replaceAll('\\','/'));
    const fake=`    Http::preventStrayRequests();
    Http::fake(function ($request) {
        $path = parse_url($request->url(), PHP_URL_PATH);
        if (str_starts_with($path, '/api/rf017-admin-')) { return Http::response('', 302); }
        if ($path === '/api/auth/csrf') { return Http::response(['csrfToken' => 'fixture-token'], 200, ['Set-Cookie' => 'bl_csrf=fixture-token; Path=/; Secure; HttpOnly']); }
        if ($path === '/api/auth/login') {
            $user = DB::table('users')->where('email', $request['email'])->first();
            if (! $user || ! password_verify($request['password'], $user->password_hash) || $request->header('X-CSRF-Token')[0] !== 'fixture-token') { throw new RuntimeException('fixture login invalid'); }
            return Http::response(['user' => ['role' => $user->role]], 200, ['Set-Cookie' => 'bl_session=fixture-session; Path=/; Secure; HttpOnly']);
        }
        if ($path === '/api/auth/me') { if (! str_contains($request->header('Cookie')[0] ?? '', 'bl_session=fixture-session')) { throw new RuntimeException('fixture session cookie missing'); } return Http::response(['user' => ['role' => 'admin']], 200); }
        if ($path === '/api/services/admin/all') { return Http::response(['services' => []], 200); }
        if ($path === '/api/barbers/me/profile') { return Http::response([], 403); }
        if ($path === '/api/auth/logout') { return Http::response('', 204); }
        if ($path === '/api/health') { return Http::response(['status' => 'ok'], 200); }
        throw new RuntimeException('fixture unexpected HTTP');
    });
`;
    const anchor="    $origin = 'https://linderosbarber.cl';";assert(source.includes(anchor));source=source.replace(anchor,fake+anchor);const helper=path.join(release,'rf017-admin-init.php');fs.writeFileSync(helper,source);
    const run=()=>{const result=cp.spawnSync(php,[helper],{cwd:release,encoding:'utf8',windowsHide:true});assert(!result.stderr,result.stderr);return {exit:result.status,body:JSON.parse(result.stdout),stdout:result.stdout};};
    const created=run();assert.equal(created.exit,0,JSON.stringify(created.body));assert.equal(created.body.status,'passed');assert.equal(created.body.maintenanceActive,false);
    const accessFile=path.join(work,'data/admin-access.json'),access=JSON.parse(fs.readFileSync(accessFile));assert.equal(access.email,'admin@linderosbarber.cl');assert(access.password.length>=32);assert(!created.stdout.includes(access.password));
    const [[user]]=await db.query('SELECT role,password_hash FROM users WHERE email=?',[access.email]);assert.equal(user.role,'admin');assert.notEqual(user.password_hash,access.password);
    assert.deepEqual(run().body,created.body);const [[count]]=await db.query('SELECT COUNT(*) AS n FROM users');assert.equal(Number(count.n),1);
    const receipt=path.join(release,'rf017-admin-result.json');fs.renameSync(receipt,receipt+'.saved');fs.renameSync(accessFile,accessFile+'.saved');
    const blocked=run();assert.equal(blocked.body.code,'EXISTING_ACCOUNT_NOT_OVERWRITTEN');assert(!fs.existsSync(accessFile));fs.renameSync(accessFile+'.saved',accessFile);fs.renameSync(receipt+'.saved',receipt);
    const [[after]]=await db.query('SELECT password_hash FROM users WHERE email=?',[access.email]);assert.equal(after.password_hash,user.password_hash);
    fs.writeFileSync(path.join(root,'docs/refactor/evidencia/RF-017-admin-local.json'),JSON.stringify({date:'2026-10-30',status:'passed',scope:'MariaDB local real, HTTP simulado con solicitudes externas prohibidas; no prueba HTTP del hosting',passwordGeneratedPrivately:true,hashStored:true,repeatedCronPreservesPassword:true,existingAccountNotOverwritten:true,reportContainsNoPassword:true,maintenanceOpensOnlyAfterSmoke:true},null,2)+'\n');console.log('Creación admin, hash, secreto privado, repetición y protección de cuenta existente aprobados.');
  }finally{await db.end();}
}
main().catch(error=>{console.error(error.code||error.message);process.exitCode=1;});
