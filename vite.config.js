import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'backend/index': resolve(__dirname, 'src/backend/index.ts'),
        // expose bundler helpers as a separate bundle so consumers
        // can import them without pulling in the full React-based library
        'bundler-config': resolve(__dirname, 'src/bundler-config.ts'),
      },
      name: 'BetterLogtoReact',
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') {
          return
        }
        warn(warning)
      },
      // react/jsx-runtime is used by TypeScript's automatic JSX transform
      // and would otherwise be inlined into the build. mark it external so
      // the runtime comes from the consumer's React package instead.
      external: ['react', 'react-dom', '@logto/react', 'jose', 'cookie-parser', 'crypto', 'node:crypto', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          '@logto/react': 'LogtoReact',
          jose: 'jose',
        },
      },
    },
  },
  optimizeDeps: {
    include: ['@logto/react'],
  },
})
