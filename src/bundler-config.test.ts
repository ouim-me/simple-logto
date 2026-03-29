/**
 * Tests for bundler-config.ts exports (task 5.7).
 *
 * Verifies that:
 *   - getBundlerConfig() returns the expected shape for each bundler target
 *   - No stale @ouim/better-logto-react package name is present
 *   - The vite config includes @logto/react (current name) in optimizeDeps
 *   - The jose alias points to the correct CJS path in all configs
 *   - Pre-built named exports (viteConfig, webpackConfig, nextjsConfig) match
 *     their corresponding getBundlerConfig() call
 */

import { describe, it, expect } from 'vitest'
import { getBundlerConfig, viteConfig, webpackConfig, nextjsConfig } from './bundler-config'

const STALE_PACKAGE_NAME = '@ouim/better-logto-react'
const CURRENT_PACKAGE_NAME = '@logto/react'
const JOSE_ALIAS_VALUE = 'jose/dist/node/cjs'

describe('getBundlerConfig — vite', () => {
  it('should return an object with optimizeDeps and resolve keys', () => {
    const config = getBundlerConfig('vite')
    expect(config).toHaveProperty('optimizeDeps')
    expect(config).toHaveProperty('resolve')
  })

  it('should include the current @logto/react package in optimizeDeps.include', () => {
    const config = getBundlerConfig('vite')
    expect(config.optimizeDeps?.include).toContain(CURRENT_PACKAGE_NAME)
  })

  it('should NOT include the stale @ouim/better-logto-react package name', () => {
    const config = getBundlerConfig('vite')
    const serialised = JSON.stringify(config)
    expect(serialised).not.toContain(STALE_PACKAGE_NAME)
  })

  it('should set the jose alias to its CJS distribution path', () => {
    const config = getBundlerConfig('vite')
    expect(config.resolve?.alias).toMatchObject({ jose: JOSE_ALIAS_VALUE })
  })

  it('should default to vite config when no bundler argument is passed', () => {
    const defaultConfig = getBundlerConfig()
    const explicitViteConfig = getBundlerConfig('vite')
    expect(defaultConfig).toEqual(explicitViteConfig)
  })
})

describe('getBundlerConfig — webpack', () => {
  it('should return an object with a resolve key', () => {
    const config = getBundlerConfig('webpack')
    expect(config).toHaveProperty('resolve')
  })

  it('should NOT include optimizeDeps (webpack does not use that API)', () => {
    const config = getBundlerConfig('webpack')
    expect(config).not.toHaveProperty('optimizeDeps')
  })

  it('should set the jose alias to its CJS distribution path', () => {
    const config = getBundlerConfig('webpack')
    expect(config.resolve?.alias).toMatchObject({ jose: JOSE_ALIAS_VALUE })
  })

  it('should NOT include the stale package name', () => {
    expect(JSON.stringify(getBundlerConfig('webpack'))).not.toContain(STALE_PACKAGE_NAME)
  })
})

describe('getBundlerConfig — nextjs', () => {
  it('should return an object with a resolve key', () => {
    const config = getBundlerConfig('nextjs')
    expect(config).toHaveProperty('resolve')
  })

  it('should NOT include optimizeDeps', () => {
    const config = getBundlerConfig('nextjs')
    expect(config).not.toHaveProperty('optimizeDeps')
  })

  it('should produce the same shape as webpack config', () => {
    expect(getBundlerConfig('nextjs')).toEqual(getBundlerConfig('webpack'))
  })

  it('should NOT include the stale package name', () => {
    expect(JSON.stringify(getBundlerConfig('nextjs'))).not.toContain(STALE_PACKAGE_NAME)
  })
})

describe('pre-built named exports', () => {
  it('viteConfig should equal getBundlerConfig("vite")', () => {
    expect(viteConfig).toEqual(getBundlerConfig('vite'))
  })

  it('webpackConfig should equal getBundlerConfig("webpack")', () => {
    expect(webpackConfig).toEqual(getBundlerConfig('webpack'))
  })

  it('nextjsConfig should equal getBundlerConfig("nextjs")', () => {
    expect(nextjsConfig).toEqual(getBundlerConfig('nextjs'))
  })

  it('all configs should be free of the stale package name', () => {
    const all = [viteConfig, webpackConfig, nextjsConfig]
    all.forEach(cfg => {
      expect(JSON.stringify(cfg)).not.toContain(STALE_PACKAGE_NAME)
    })
  })
})
