import { getBundlerConfig, nextjsConfig, viteConfig, webpackConfig } from '@ouim/simple-logto/bundler-config'

const vite = getBundlerConfig('vite')
const webpack = getBundlerConfig('webpack')
const nextjs = getBundlerConfig('nextjs')

if (!vite.optimizeDeps || !webpack.resolve || !nextjs.resolve) {
  throw new Error('Bundler config exports did not match the expected public shape.')
}

void viteConfig
void webpackConfig
void nextjsConfig
