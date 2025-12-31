import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: '/flowcards/',
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/couchdb': {
            target: 'http://localhost:5984',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/couchdb/, ''),
            configure: (proxy, _options) => {
              proxy.on('proxyReq', (proxyReq, req, _res) => {
                // Add Basic Auth header
                const auth = Buffer.from('admin:P@55w0rd!').toString('base64');
                proxyReq.setHeader('Authorization', `Basic ${auth}`);
              });
            },
          },
        },
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
