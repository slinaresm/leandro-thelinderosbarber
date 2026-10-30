import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root=path.resolve(import.meta.dirname,'../../..');
export function buildPrivateApi(output, vendor=path.join(root,'api/vendor')) {
  assert(!fs.existsSync(output),'El destino del paquete debe ser nuevo.');
  const installed=JSON.parse(fs.readFileSync(path.join(vendor,'composer/installed.json')));
  assert.equal(installed.dev,false); assert.equal(installed['dev-package-names'].length,0);
  fs.mkdirSync(output,{recursive:true});
  const copy=(source,target)=>{
    assert(!fs.lstatSync(source).isSymbolicLink(),'No empaquetar symlinks.');
    if(fs.statSync(source).isDirectory()){
      fs.mkdirSync(target,{recursive:true});
      for(const entry of fs.readdirSync(source))if(!entry.startsWith('.')&&!(path.basename(source)==='bootstrap'&&entry==='cache'))copy(path.join(source,entry),path.join(target,entry));
    }else{fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);}
  };
  for(const entry of ['app','bootstrap','config','database/migrations','routes','public','artisan','composer.json','composer.lock'])copy(path.join(root,'api',entry),path.join(output,'api',entry));
  copy(vendor,path.join(output,'api/vendor'));
  for(const name of ['mysql/schema-manifest.json','mysql/migrations/001_legacy_baseline.sql','mariadb/migrations/001_legacy_baseline.sql'])copy(path.join(root,'database',name),path.join(output,'database',name));
  copy(path.join(root,'tools/refactor/hosting/api-init.php'),path.join(output,'rf017-api-init.php'));
  const files={};
  function inspect(directory){for(const entry of fs.readdirSync(directory)){const target=path.join(directory,entry);if(fs.statSync(target).isDirectory())inspect(target);else {const relative=path.relative(output,target).replaceAll('\\','/');assert(!/(^|\/)(\.env|storage|uploads|node_modules|tests)(\/|$)/.test(relative),'Contenido privado en paquete');files[relative]=crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');}}}
  inspect(output);
  const manifest={format:'private-api-release-v1',files,php:'8.4',database:'MariaDB 10.6.28',publicFiles:0};
  fs.writeFileSync(path.join(output,'release-api.json'),JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const manifest=buildPrivateApi(process.argv[2]);console.log('API privada empaquetada: '+Object.keys(manifest.files).length+' archivos; sin entorno ni datos.');}catch(error){console.error(error.message);process.exitCode=1;}
}
