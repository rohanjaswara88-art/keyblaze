import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mediaDir = path.resolve(here, '../media');
const types = { '.jpg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json', '.mp4': 'video/mp4' };

// The artwork lives in ../media (it is also what the built site serves), so dev serves it from there too.
const serveMedia = {
  name: 'serve-media',
  configureServer(server) {
    server.middlewares.use('/media', (req, res, next) => {
      const file = path.join(mediaDir, decodeURIComponent((req.url || '/').split('?')[0]));
      if (!file.startsWith(mediaDir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next();
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      fs.createReadStream(file).pipe(res);
    });
  }
};

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [react(), serveMedia],
  build: { outDir: '..', emptyOutDir: false, assetsDir: 'assets', chunkSizeWarningLimit: 900 }
});
