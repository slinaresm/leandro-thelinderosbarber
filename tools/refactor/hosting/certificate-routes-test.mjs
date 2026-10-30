import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { apacheRules } from './package.mjs';
const root=path.resolve(import.meta.dirname,'../../..'),work=path.join(root,'.refactor-data/certificate-routes-'+crypto.randomBytes(5).toString('hex'));
const apache=path.join(root,'.refactor-data/runtime/apache-2.4.69/Apache24'),publicRoot=path.join(work,'public');
for(const dir of ['acme-challenge','pki-validation'])fs.mkdirSync(path.join(publicRoot,'.well-known',dir),{recursive:true});
fs.writeFileSync(path.join(publicRoot,'.well-known/acme-challenge/test-token'),'token');
fs.writeFileSync(path.join(publicRoot,'.well-known/pki-validation/abc.txt'),'pki');
fs.writeFileSync(path.join(publicRoot,'.htaccess'),apacheRules("default-src 'self'",'https://linderosbarber.cl'));
const listener=http.createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
const normalized=value=>value.replaceAll('\\','/'),config=path.join(work,'httpd.conf');
fs.writeFileSync(config,`ServerRoot "${normalized(apache)}"
Listen 127.0.0.1:${port}
ServerName localhost:${port}
PidFile "${normalized(path.join(work,'httpd.pid'))}"
ErrorLog "${normalized(path.join(work,'error.log'))}"
${['authz_core','authz_host','mime','dir','rewrite','headers','ssl','log_config'].map(name=>`LoadModule ${name}_module modules/mod_${name}.so`).join('\n')}
TypesConfig "${normalized(path.join(apache,'conf/mime.types'))}"
DocumentRoot "${normalized(publicRoot)}"
<Directory "${normalized(publicRoot)}">
AllowOverride All
Require all granted
</Directory>
`);
const child=cp.spawn(path.join(apache,'bin/httpd.exe'),['-f',config,'-X'],{windowsHide:true,stdio:'ignore'}),exit=new Promise(resolve=>child.once('exit',resolve));
try{
  const url='http://127.0.0.1:'+port;let ready=false;for(let i=0;i<100;i++){try{await fetch(url,{redirect:'manual'});ready=true;break;}catch{}await new Promise(resolve=>setTimeout(resolve,50));}assert(ready);
  for(const [route,text]of [['/.well-known/acme-challenge/test-token','token'],['/.well-known/pki-validation/abc.txt','pki']]){const response=await fetch(url+route,{redirect:'manual'});assert.equal(response.status,200);assert.equal(await response.text(),text);}
  for(const route of ['/','/.env','/.well-known/acme-challenge/missing']){const response=await fetch(url+route,{redirect:'manual'});assert.equal(response.status,308);assert.equal(response.headers.get('location'),'https://linderosbarber.cl'+route);}
  console.log('Apache real: validaciones de certificado accesibles; resto conserva redirección HTTPS.');
}finally{child.kill();await exit;}
