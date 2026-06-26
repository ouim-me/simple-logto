// Configuration helper for Logto-related bundler setup.
// This can be imported and used in consuming project's bundler configuration.

interface BundlerConfig {
  optimizeDeps?: {
    include: string[]
  }
  resolve?: {
    alias: Record<string, string>
  }
  alias?: Record<string, string>
}

/**
 * Bundler Configuration Helper
 *
 * Returns bundler-specific configuration for consumers that need a small amount of
 * dependency pre-bundling help. We intentionally do not alias jose: modern jose
 * versions expose supported package exports and deep CJS aliases are brittle.
 *
 * @param {'vite' | 'webpack' | 'nextjs'} [bundler='vite'] - Target bundler type
 *
 * @returns {BundlerConfig} Configuration object for the specified bundler
 *
 * @example
 * // Vite configuration
 * import { getBundlerConfig } from '@ouim/logto-authkit';
 * import { defineConfig } from 'vite';
 *
 * export default defineConfig({
 *   ...getBundlerConfig('vite'),
 *   // other vite config
 * });
 *
 * @example
 * // Webpack configuration
 * import { getBundlerConfig } from '@ouim/logto-authkit';
 *
 * module.exports = {
 *   ...getBundlerConfig('webpack'),
 *   // other webpack config
 * };
 *
 * @example
 * // Next.js configuration
 * const { getBundlerConfig } = require('@ouim/logto-authkit');
 *
 * module.exports = {
 *   ...getBundlerConfig('nextjs'),
 *   // other Next.js config
 * };
 */
export const getBundlerConfig = (bundler: 'vite' | 'webpack' | 'nextjs' = 'vite'): BundlerConfig => {
  switch (bundler) {
    case 'vite':
      return {
        optimizeDeps: {
          include: ['@logto/react'],
        },
        resolve: {
          alias: {},
        },
      }

    case 'webpack':
    case 'nextjs':
      return {
        resolve: {
          alias: {},
        },
      }

    default:
      return { alias: {} }
  }
}

/**
 * Vite bundler configuration pre-built for Logto.
 * Use this directly in your vite.config.ts if you don't need custom configuration.
 *
 * @example
 * import { viteConfig } from '@ouim/logto-authkit';
 * import { defineConfig } from 'vite';
 *
 * export default defineConfig({ ...viteConfig });
 */
export const viteConfig = getBundlerConfig('vite')

/**
 * Webpack bundler configuration pre-built for Logto.
 * Use this directly in your webpack.config.js if you don't need custom configuration.
 *
 * @example
 * const { webpackConfig } = require('@ouim/logto-authkit');
 *
 * module.exports = { ...webpackConfig, entry: './src/index.js' };
 */
export const webpackConfig = getBundlerConfig('webpack')

/**
 * Next.js bundler configuration pre-built for Logto.
 * Use this directly in your next.config.js if you don't need custom configuration.
 *
 * @example
 * const { nextjsConfig } = require('@ouim/logto-authkit');
 *
 * module.exports = { ...nextjsConfig };
 */
export const nextjsConfig = getBundlerConfig('nextjs')
