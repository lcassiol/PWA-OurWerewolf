import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const appVersion = [
  process.env.npm_package_version ?? 'dev',
  process.env.VITE_BUILD_ID,
]
  .filter(Boolean)
  .join('-');

const proxy = {
  '/api': {
    target: 'http://localhost:3001',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api/, ''),
  },
  '/ws': { target: 'ws://localhost:3001', ws: true },
};

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [react()],
  server: {
    port: 5173,
    proxy,
  },
  preview: { proxy },
});
