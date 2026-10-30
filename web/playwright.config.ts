import { defineConfig } from '@playwright/test';
import fs from 'node:fs';
if (!process.env.WEB_TEST_CONTEXT) throw new Error('Ejecutar mediante npm run web:test desde la raíz.');
const fixture = JSON.parse(fs.readFileSync(process.env.WEB_TEST_CONTEXT, 'utf8'));
export default defineConfig({
  testDir: './tests', workers: 1, fullyParallel: false, timeout: 45000, retries: 0,
  reporter: [['list'], ['json']],
  use: { baseURL: fixture.url, channel: 'msedge', headless: true, reducedMotion: 'reduce',
    viewport: { width: 1440, height: 1000 }, locale: 'es-CL', trace: 'off', screenshot: 'off' },
});
