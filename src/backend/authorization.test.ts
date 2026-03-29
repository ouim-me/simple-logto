import { describe, expect, it } from 'vitest'
import { hasRole, hasScopes, requireRole, requireScopes } from './authorization'
import type { AuthContext, AuthPayload } from './types'

function buildPayload(overrides: Partial<AuthPayload> = {}): AuthPayload {
  return {
    sub: 'user-123',
    scope: 'read:profile write:profile admin:users',
    iss: 'https://tenant.logto.app/oidc',
    ...overrides,
  }
}

function buildAuthContext(payload: AuthPayload | null): AuthContext {
  return {
    userId: payload?.sub ?? null,
    isAuthenticated: Boolean(payload),
    payload,
    isGuest: false,
  }
}

describe('scope authorization helpers', () => {
  it('returns true when all required scopes are present by default', () => {
    expect(hasScopes(buildPayload(), ['read:profile', 'write:profile'])).toBe(true)
  })

  it('returns false when one of the required scopes is missing in all mode', () => {
    expect(hasScopes(buildPayload(), ['read:profile', 'billing:read'])).toBe(false)
  })

  it('supports any mode for partial scope matches', () => {
    expect(hasScopes(buildPayload(), ['billing:read', 'admin:users'], { mode: 'any' })).toBe(true)
  })

  it('accepts an AuthContext as the subject', () => {
    const auth = buildAuthContext(buildPayload())
    expect(hasScopes(auth, 'admin:users')).toBe(true)
  })

  it('splits whitespace-delimited required scope strings', () => {
    expect(hasScopes(buildPayload(), 'read:profile write:profile')).toBe(true)
  })

  it('returns false when the payload is missing', () => {
    expect(hasScopes(buildAuthContext(null), 'read:profile')).toBe(false)
  })

  it('requireScopes does not throw when all scopes are present', () => {
    expect(() => requireScopes(buildPayload(), ['read:profile', 'admin:users'])).not.toThrow()
  })

  it('requireScopes supports any mode', () => {
    expect(() => requireScopes(buildPayload(), ['billing:read', 'admin:users'], { mode: 'any' })).not.toThrow()
  })

  it('requireScopes throws a descriptive error when scopes are missing', () => {
    expect(() => requireScopes(buildPayload(), ['read:profile', 'billing:read'])).toThrow(
      /Missing required scopes/,
    )
  })

  it('treats an empty required scope list as a no-op', () => {
    expect(() => requireScopes(buildPayload(), [])).not.toThrow()
    expect(hasScopes(buildPayload(), [])).toBe(true)
  })
})

describe('role authorization helpers', () => {
  it('returns true when the payload contains the requested role in roles[]', () => {
    const payload = buildPayload({ roles: ['admin', 'support'] })
    expect(hasRole(payload, 'admin')).toBe(true)
  })

  it('falls back to the role claim when roles is not present', () => {
    const payload = buildPayload({ role: 'admin support' })
    expect(hasRole(payload, 'support')).toBe(true)
  })

  it('supports custom claim keys', () => {
    const payload = buildPayload({ 'https://example.com/roles': ['tenant:owner'] })
    expect(hasRole(payload, 'tenant:owner', { claimKeys: ['https://example.com/roles'] })).toBe(true)
  })

  it('returns false when the requested role is missing', () => {
    const payload = buildPayload({ roles: ['viewer'] })
    expect(hasRole(payload, 'admin')).toBe(false)
  })

  it('returns false when no role claims are present', () => {
    expect(hasRole(buildPayload(), 'admin')).toBe(false)
  })

  it('accepts an AuthContext as the subject', () => {
    const auth = buildAuthContext(buildPayload({ roles: ['admin'] }))
    expect(hasRole(auth, 'admin')).toBe(true)
  })

  it('requireRole does not throw when the role is present', () => {
    expect(() => requireRole(buildPayload({ roles: ['admin'] }), 'admin')).not.toThrow()
  })

  it('requireRole throws a descriptive error when the role is missing', () => {
    expect(() => requireRole(buildPayload({ roles: ['viewer'] }), 'admin')).toThrow(/Missing required role/)
  })
})
