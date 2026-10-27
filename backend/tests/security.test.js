const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'linderos-security-'));
process.env.SQLITE_FILE = path.join(folder, 'test.sqlite');
process.env.DB_DRIVER = 'sqlite';
process.env.NODE_ENV = 'test';
process.env.SITE_ORIGIN = 'http://localhost:8080';
process.env.NOTIFICATIONS_ENABLED = 'false';
process.env.JWT_SECRET = 'test-only-secret-that-is-long-enough-and-not-for-deployment';
const { server, io } = require('../server');
const getDb = require('../config/db');
test('friendly routes, security headers, sessions, CSRF, permissions and upload validation', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = (url, options = {}) => fetch(base + url, {redirect:'manual', ...options});
  const json = body => ({method:'POST', headers:{'Content-Type':'application/json',Origin:process.env.SITE_ORIGIN},body:JSON.stringify(body)});
  try {
    for (const url of ['/', '/tienda', '/ingresar', '/registro', '/reservar', '/politicas-de-servicio']) {
      const res = await send(url); assert.equal(res.status,200,url);
      const html = await res.text(); assert.ok(!html.includes('BARBER123'));
      assert.equal(res.headers.get('x-powered-by'),null);
      assert.equal(res.headers.get('x-content-type-options'),'nosniff');
      const csp=res.headers.get('content-security-policy'); assert.ok(csp.includes("frame-ancestors 'none'")); assert.ok(!csp.includes("script-src 'unsafe-inline'"));
      if(url==='/ingresar') assert.ok(csp.includes('sha256-'),'existing inline script is explicitly hashed');
    }
    const legacy = await send('/productos.html?checkout=1'); assert.equal(legacy.status,308); assert.equal(legacy.headers.get('location'),'/tienda?checkout=1');
    for(const url of ['/administracion','/barbero','/mi-cuenta/reservas']) { const res=await send(url); assert.equal(res.status,303); assert.equal(res.headers.get('location'),'/ingresar'); }
    for(const url of ['/.env','/server.js','/backend/.env']) assert.equal((await send(url)).status,404);
    assert.equal((await send('/api/products/admin/all')).status,401);
    assert.equal((await send('/uploads/invoices/private.pdf')).status,401);
    assert.equal((await send('/api/auth/register',json({name:'Client',email:'client@example.test',password:'short'}))).status,400);
    assert.equal((await send('/api/auth/login',json({email:{value:'bad'},password:'hello'}))).status,400);
    const user={name:'Test Client',email:'client@example.test',password:'Long-password-12345'};
    const register=await send('/api/auth/register',json(user)); assert.equal(register.status,201);
    const cookie=register.headers.get('set-cookie'); assert.match(cookie,/HttpOnly/i);assert.match(cookie,/SameSite=Lax/i);assert.match(cookie,/Max-Age=28800/);
    assert.equal((await register.json()).token,undefined);
    const session=cookie.split(';')[0]; const headers={Cookie:session,Origin:process.env.SITE_ORIGIN};
    assert.equal((await send('/api/auth/me',{headers})).status,200);
    assert.equal((await send('/api/products/admin/all',{headers})).status,403);
    assert.equal((await send('/uploads/invoices/private.pdf',{headers})).status,403);
    const attack=await send('/api/auth/logout',{method:'POST',headers:{Cookie:session,Origin:'https://attacker.example'}});assert.equal(attack.status,403);
    assert.equal((await send('/api/auth/me',{headers})).status,200);
    assert.equal((await send('/socket.io/?EIO=4&transport=polling',{headers:{Origin:'https://attacker.example'}})).status,403);
    const admin=require('../utils/jwt').signToken({id:'test-admin',role:'admin'});
    const data=new FormData(); data.set('image',new Blob(['<script>alert(1)</script>'],{type:'image/png'}),'attack.html');
    const upload=await send('/api/products',{method:'POST',headers:{Authorization:`Bearer ${admin}`,Origin:process.env.SITE_ORIGIN},body:data});assert.equal(upload.status,400);
    for(let i=0;i<11;i++) { const res=await send('/api/auth/login',json({email:user.email,password:'Wrong-password'}));if(i===10)assert.equal(res.status,429); }
    const logout=await send('/api/auth/logout',{method:'POST',headers});assert.equal(logout.status,204);assert.match(logout.headers.get('set-cookie'),/Expires=Thu, 01 Jan 1970/);
    const weak=spawnSync(process.execPath,['-e','require("./config/env")'],{cwd:path.join(__dirname,'..'),env:{...process.env,NODE_ENV:'production',JWT_SECRET:'weak',SITE_ORIGIN:'https://example.test'},encoding:'utf8'});assert.notEqual(weak.status,0);
  } finally {
    await new Promise(resolve=>io.close(resolve));
    const db=await getDb();await db.close();
    for(const name of ['test.sqlite','test.sqlite-wal','test.sqlite-shm']) { const file=path.join(folder,name);if(fs.existsSync(file))fs.unlinkSync(file); }
    fs.rmdirSync(folder);
  }
});
