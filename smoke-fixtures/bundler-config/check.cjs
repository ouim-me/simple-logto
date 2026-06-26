const { getBundlerConfig, nextjsConfig, viteConfig, webpackConfig } = require('@ouim/logto-authkit/bundler-config')

const vite = getBundlerConfig('vite')

if (vite.optimizeDeps?.include?.[0] !== '@logto/react') {
  throw new Error('Expected vite optimizeDeps.include to contain @logto/react.')
}

if (JSON.stringify(viteConfig).includes('jose/dist/node/cjs')) {
  throw new Error('viteConfig must not alias jose to an unsupported deep CJS path.')
}

if (JSON.stringify(webpackConfig).includes('jose/dist/node/cjs') || JSON.stringify(nextjsConfig).includes('jose/dist/node/cjs')) {
  throw new Error('webpackConfig and nextjsConfig must not alias jose to an unsupported deep CJS path.')
}

console.log('bundler CommonJS smoke test passed')
