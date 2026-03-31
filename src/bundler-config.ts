// Configuration helper for resolving jose library issues
// This can be imported and used in consuming project's bundler configuration

import { warnPackageDeprecation } from './deprecation-warning.js'

warnPackageDeprecation('bundler-config')

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
 * Returns bundler-specific configuration to resolve the jose library correctly.
 * The jose library has different import paths for different environments, and bundlers
 * need proper configuration to handle these correctly.
 *
 * @param {'vite' | 'webpack' | 'nextjs'} [bundler='vite'] - Target bundler type
 *
 * @returns {BundlerConfig} Configuration object for the specified bundler
 *
 * @example
 * // Vite configuration
 * import { getBundlerConfig } from '@ouim/simple-logto';
 * import { defineConfig } from 'vite';
 *
 * export default defineConfig({
 *   ...getBundlerConfig('vite'),
 *   // other vite config
 * });
 *
 * @example
 * // Webpack configuration
 * import { getBundlerConfig } from '@ouim/simple-logto';
 *
 * module.exports = {
 *   ...getBundlerConfig('webpack'),
 *   // other webpack config
 * };
 *
 * @example
 * // Next.js configuration
 * const { getBundlerConfig } = require('@ouim/simple-logto');
 *
 * module.exports = {
 *   ...getBundlerConfig('nextjs'),
 *   // other Next.js config
 * };
 */
export const getBundlerConfig = (bundler: 'vite' | 'webpack' | 'nextjs' = 'vite'): BundlerConfig => {
  const joseAlias = {
    jose: 'jose/dist/node/cjs',
  }

  switch (bundler) {
    case 'vite':
      return {
        optimizeDeps: {
          include: ['@logto/react'],
        },
        resolve: {
          alias: joseAlias,
        },
      }

    case 'webpack':
    case 'nextjs':
      return {
        resolve: {
          alias: joseAlias,
        },
      }

    default:
      return { alias: joseAlias }
  }
}

/**
 * Vite bundler configuration pre-built for Logto.
 * Use this directly in your vite.config.ts if you don't need custom configuration.
 *
 * @example
 * import { viteConfig } from '@ouim/simple-logto';
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
 * const { webpackConfig } = require('@ouim/simple-logto');
 *
 * module.exports = { ...webpackConfig, entry: './src/index.js' };
 */
export const webpackConfig = getBundlerConfig('webpack')

/**
 * Next.js bundler configuration pre-built for Logto.
 * Use this directly in your next.config.js if you don't need custom configuration.
 *
 * @example
 * const { nextjsConfig } = require('@ouim/simple-logto');
 *
 * module.exports = { ...nextjsConfig };
 */
export const nextjsConfig = getBundlerConfig('nextjs')
