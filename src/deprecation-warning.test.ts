import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetPackageDeprecationWarningsForTests, warnPackageDeprecation } from './deprecation-warning'

describe('warnPackageDeprecation', () => {
  const originalNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    process.env.NODE_ENV = 'development'
    resetPackageDeprecationWarningsForTests()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    resetPackageDeprecationWarningsForTests()
    vi.restoreAllMocks()
  })

  it('warns once per entrypoint in development', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    warnPackageDeprecation('root')
    warnPackageDeprecation('root')

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('@ouim/simple-logto')
    )
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('@ouim/logto-authkit')
    )
  })

  it('tracks each public entrypoint separately', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    warnPackageDeprecation('root')
    warnPackageDeprecation('backend')
    warnPackageDeprecation('bundler-config')

    expect(warnSpy).toHaveBeenCalledTimes(3)
    expect(warnSpy.mock.calls[1]?.[0]).toContain('@ouim/simple-logto/backend')
    expect(warnSpy.mock.calls[1]?.[0]).toContain('@ouim/logto-authkit/server')
    expect(warnSpy.mock.calls[2]?.[0]).toContain('@ouim/simple-logto/bundler-config')
    expect(warnSpy.mock.calls[2]?.[0]).toContain('@ouim/logto-authkit/bundler-config')
  })

  it('does not warn in production', () => {
    process.env.NODE_ENV = 'production'
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    warnPackageDeprecation('root')

    expect(warnSpy).not.toHaveBeenCalled()
  })
})
