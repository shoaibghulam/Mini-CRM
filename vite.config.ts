import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Long-lived vendor chunks cache across deploys; pages are lazy-loaded in App.tsx.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          mantine: ['@mantine/core', '@mantine/hooks', '@mantine/form', '@mantine/modals', '@mantine/notifications'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
  resolve: {
    alias: {
      // Keep in sync with the `paths` entry in tsconfig.json and vitest.config.ts.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
