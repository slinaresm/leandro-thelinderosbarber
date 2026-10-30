import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const source = new URL('../../frontend/assets/', import.meta.url);
const target = new URL('../public/assets/', import.meta.url);
await mkdir(target, { recursive: true });
for (const folder of ['css', 'img', 'videos']) {
  await cp(fileURLToPath(new URL(folder, source)), fileURLToPath(new URL(folder, target)), { recursive: true });
}
// Las fuentes se sirven localmente; el build nunca depende de Google Fonts.
for (const css of ['style', 'vintage-home']) {
  const file = new URL('css/' + css + '.css', target);
  await writeFile(file, (await readFile(file, 'utf8')).replace(/@import url\('https:\/\/fonts\.googleapis\.com\/[^']+'\);/g, "@import url('/fonts/fonts.css');"));
}
console.log('CSS, imágenes y videos preparados; no se copian scripts del legado.');
