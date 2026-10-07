/**
 * Dev server and build of the web app. In development, `/api`, `/ws` and `/sprites` go to the
 * local server (apps/server, port 3001), so both run side by side with `npm run dev`.
 */
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const SERVER = `http://127.0.0.1:${process.env.SERVER_PORT ?? 3001}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: true,
    proxy: {
      '/api': SERVER,
      '/sprites': SERVER,
      '/ws': { target: SERVER, ws: true },
    },
  },
  // Workspace packages are TypeScript sources: let Vite transform them like app code.
  optimizeDeps: {
    exclude: ['@colleja/core', '@colleja/data', '@colleja/narration', '@colleja/protocol'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
});
