/**
 * Tests for cookie utilities (cookieUtils, jwtCookieUtils) and guest utilities
 * (guestUtils) defined in utils.ts.
 *
 * Environment: happy-dom (provides document.cookie) — the `secure` flag is set
 * on cookies but happy-dom does not enforce the HTTPS-only restriction at the
 * document level, so cookies are readable in tests regardless.
 *
 * Coverage targets (task 5.6):
 *   - cookieUtils.setCookie / getCookie / removeCookie
 *   - jwtCookieUtils.saveToken / getToken / removeToken
 *   - guestUtils.getGuestId / setGuestId / ensureGuestId / clearGuestId
 *   - guestUtils.generateGuestId (fingerprint path + crypto fallback)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { cookieUtils, jwtCookieUtils, guestUtils } from './utils'

// ---------------------------------------------------------------------------
// Mock FingerprintJS so tests don't make real network calls
// ---------------------------------------------------------------------------
vi.mock('@fingerprintjs/fingerprintjs', () => ({
  default: {
    load: vi.fn().mockResolvedValue({
      get: vi.fn().mockResolvedValue({ visitorId: 'mock-fingerprint-id' }),
    }),
  },
}))

// ---------------------------------------------------------------------------
// Helper: clear ALL cookies between tests so they don't bleed into each other.
// happy-dom exposes document.cookie as a semi-colon separated list; we delete
// each one by setting an expired date.
// ---------------------------------------------------------------------------
function clearAllCookies() {
  document.cookie.split(';').forEach(cookie => {
    const name = cookie.trim().split('=')[0]
    if (name) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:01 GMT; path=/`
    }
  })
}

// ---------------------------------------------------------------------------
// cookieUtils
// ---------------------------------------------------------------------------

describe('cookieUtils.setCookie', () => {
  beforeEach(clearAllCookies)

  it('should set a cookie with the given name and value', () => {
    cookieUtils.setCookie('test_cookie', 'hello')
    expect(document.cookie).toContain('test_cookie=hello')
  })

  it('should percent-encode cookie name and value', () => {
    cookieUtils.setCookie('test cookie', 'value with spaces')
    // encodeURIComponent('test cookie') = 'test%20cookie'
    expect(document.cookie).toContain('test%20cookie=value%20with%20spaces')
  })

  it('should set a cookie that is subsequently readable by getCookie', () => {
    cookieUtils.setCookie('readable_test', 'world')
    expect(cookieUtils.getCookie('readable_test')).toBe('world')
  })

  it('should overwrite an existing cookie with the same name', () => {
    cookieUtils.setCookie('overwrite_me', 'first')
    cookieUtils.setCookie('overwrite_me', 'second')
    expect(cookieUtils.getCookie('overwrite_me')).toBe('second')
  })
})

describe('cookieUtils.getCookie', () => {
  beforeEach(clearAllCookies)

  it('should return null when the cookie does not exist', () => {
    expect(cookieUtils.getCookie('non_existent')).toBeNull()
  })

  it('should return the correct value for an existing cookie', () => {
    cookieUtils.setCookie('my_cookie', 'my_value')
    expect(cookieUtils.getCookie('my_cookie')).toBe('my_value')
  })

  it('should return null when document is not available (SSR guard)', () => {
    // Temporarily hide document to simulate SSR environment
    const original = globalThis.document
    // @ts-expect-error intentional undefined assignment
    globalThis.document = undefined
    expect(cookieUtils.getCookie('any')).toBeNull()
    globalThis.document = original
  })

  it('should correctly decode percent-encoded cookie values', () => {
    cookieUtils.setCookie('encoded_key', 'hello world')
    expect(cookieUtils.getCookie('encoded_key')).toBe('hello world')
  })
})

describe('cookieUtils.removeCookie', () => {
  beforeEach(clearAllCookies)

  it('should remove an existing cookie so getCookie returns null', () => {
    cookieUtils.setCookie('removable', 'value')
    expect(cookieUtils.getCookie('removable')).toBe('value')

    cookieUtils.removeCookie('removable')
    expect(cookieUtils.getCookie('removable')).toBeNull()
  })

  it('should not throw when removing a cookie that does not exist', () => {
    expect(() => cookieUtils.removeCookie('ghost_cookie')).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// jwtCookieUtils
// ---------------------------------------------------------------------------

describe('jwtCookieUtils', () => {
  beforeEach(clearAllCookies)

  it('saveToken should set a logto_authtoken cookie', () => {
    jwtCookieUtils.saveToken('my.jwt.token')
    expect(cookieUtils.getCookie('logto_authtoken')).toBe('my.jwt.token')
  })

  it('getToken should return the previously saved token', () => {
    jwtCookieUtils.saveToken('a.b.c')
    expect(jwtCookieUtils.getToken()).toBe('a.b.c')
  })

  it('getToken should return null when no token has been saved', () => {
    expect(jwtCookieUtils.getToken()).toBeNull()
  })

  it('removeToken should delete the logto_authtoken cookie', () => {
    jwtCookieUtils.saveToken('token.to.remove')
    jwtCookieUtils.removeToken()
    expect(jwtCookieUtils.getToken()).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// guestUtils
// ---------------------------------------------------------------------------

describe('guestUtils.getGuestId', () => {
  beforeEach(clearAllCookies)

  it('should return null when no guest cookie is present', () => {
    expect(guestUtils.getGuestId()).toBeNull()
  })

  it('should return the guest ID when the cookie exists', () => {
    cookieUtils.setCookie('guest_logto_authtoken', 'guest-abc-123')
    expect(guestUtils.getGuestId()).toBe('guest-abc-123')
  })
})

describe('guestUtils.setGuestId', () => {
  beforeEach(() => {
    clearAllCookies()
    vi.clearAllMocks()
  })

  it('should persist a given guest ID to the cookie', async () => {
    await guestUtils.setGuestId('provided-guest-id')
    expect(guestUtils.getGuestId()).toBe('provided-guest-id')
  })

  it('should generate a fingerprint-based ID when none is provided', async () => {
    const id = await guestUtils.setGuestId()
    // The mock FingerprintJS returns 'mock-fingerprint-id'
    expect(id).toBe('mock-fingerprint-id')
    expect(guestUtils.getGuestId()).toBe('mock-fingerprint-id')
  })

  it('should fall back to crypto.randomUUID when FingerprintJS fails', async () => {
    const FingerprintJS = (await import('@fingerprintjs/fingerprintjs')).default as any
    FingerprintJS.load.mockRejectedValueOnce(new Error('fp failed'))

    const id = await guestUtils.setGuestId()
    // The fallback path uses crypto.randomUUID — just verify a non-empty string is returned
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
    // And verify it was persisted to the cookie
    expect(guestUtils.getGuestId()).toBe(id)
  })
})

describe('guestUtils.ensureGuestId', () => {
  beforeEach(() => {
    clearAllCookies()
    vi.clearAllMocks()
  })

  it('should return the existing guest ID without generating a new one', async () => {
    cookieUtils.setCookie('guest_logto_authtoken', 'existing-guest')
    const id = await guestUtils.ensureGuestId()
    expect(id).toBe('existing-guest')
  })

  it('should create and return a new guest ID when none exists', async () => {
    const id = await guestUtils.ensureGuestId()
    // FingerprintJS mock returns 'mock-fingerprint-id'
    expect(id).toBe('mock-fingerprint-id')
    // And it is now stored in the cookie
    expect(guestUtils.getGuestId()).toBe('mock-fingerprint-id')
  })
})

describe('guestUtils.clearGuestId', () => {
  beforeEach(clearAllCookies)

  it('should remove the guest cookie so getGuestId returns null', () => {
    cookieUtils.setCookie('guest_logto_authtoken', 'to-be-cleared')
    expect(guestUtils.getGuestId()).toBe('to-be-cleared')

    guestUtils.clearGuestId()
    expect(guestUtils.getGuestId()).toBeNull()
  })

  it('should not throw when no guest cookie exists', () => {
    expect(() => guestUtils.clearGuestId()).not.toThrow()
  })
})

describe('guestUtils.generateGuestId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return the fingerprint visitorId on the happy path', async () => {
    const id = await guestUtils.generateGuestId()
    expect(id).toBe('mock-fingerprint-id')
  })

  it('should fall back to crypto.randomUUID when FingerprintJS throws', async () => {
    const FingerprintJS = (await import('@fingerprintjs/fingerprintjs')).default as any
    FingerprintJS.load.mockRejectedValueOnce(new Error('network error'))

    const id = await guestUtils.generateGuestId()
    // happy-dom provides globalThis.crypto.randomUUID — the result is a valid UUID v4
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })
})
