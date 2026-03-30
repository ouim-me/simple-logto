import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const appNodeModules = path.resolve(__dirname, 'node_modules');

export default defineConfig({
  server: {
    port: 3002,
    host: '0.0.0.0',
    fs: {
      allow: [path.resolve(__dirname, '..')]
    }
  },
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: ['@logto/react'],
    exclude: ['@ouim/simple-logto', '@ouim/simple-logto/backend', '@ouim/simple-logto/bundler-config']
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      react: path.resolve(appNodeModules, 'react'),
      'react-dom': path.resolve(appNodeModules, 'react-dom'),
      '@ouim/simple-logto': path.resolve(__dirname, '../src/index.ts'),
      '@ouim/simple-logto/backend': path.resolve(__dirname, '../src/backend/index.ts'),
      '@ouim/simple-logto/bundler-config': path.resolve(__dirname, '../src/bundler-config.ts')
    }
  }
});
