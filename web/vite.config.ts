import { defineConfig } from 'vite';
import { reactRouter } from '@react-router/dev/vite';

export default defineConfig({
  plugins: [reactRouter()],
  server: {
    proxy: Object.fromEntries(['/api', '/uploads/haircuts', '/uploads/products', '/uploads/invoices'].map(prefix => [prefix, { target: process.env.API_PROXY || 'http://127.0.0.1:8081' }])),
  },
});
