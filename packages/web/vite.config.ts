import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// `pnpm dev` talks to the deployed dev API through CloudFront (ADR 0008), so no CORS is needed.
export default defineConfig({
  plugins: [react()],
  // amazon-cognito-identity-js reads Node's `global`; browsers only have `globalThis`.
  define: { global: 'globalThis' },
  optimizeDeps: { esbuildOptions: { define: { global: 'globalThis' } } },
  server: {
    proxy: {
      '/api': { target: 'https://dev.within.doroshenk.com', changeOrigin: true },
    },
  },
});
