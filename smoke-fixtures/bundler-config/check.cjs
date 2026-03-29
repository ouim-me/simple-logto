const { getBundlerConfig, nextjsConfig, viteConfig, webpackConfig } = require('@ouim/simple-logto/bundler-config')

const vite = getBundlerConfig('vite')

if (vite.optimizeDeps?.include?.[0] !== '@logto/react') {
  throw new Error('Expected vite optimizeDeps.include to contain @logto/react.')
}

if (viteConfig.resolve?.alias?.jose !== 'jose/dist/node/cjs') {
  throw new Error('Expected viteConfig to expose the jose alias.')
}

if (!webpackConfig.resolve || !nextjsConfig.resolve) {
  throw new Error('Expected webpackConfig and nextjsConfig to expose resolve.alias.')
}

console.log('bundler CommonJS smoke test passed')
