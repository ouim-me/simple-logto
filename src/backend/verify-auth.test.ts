import { describe, it, expect, beforeEach, vi } from 'vitest'
import { verifyLogtoToken } from './verify-auth'
import type { VerifyAuthOptions } from './types'

// Mock jose library
vi.mock('jose', () => ({
  importJWK: vi.fn().mockResolvedValue({}),
  jwtVerify: vi.fn(),
}))

// Mock fetch globally
global.fetch = vi.fn()

const mockOptions: VerifyAuthOptions = {
  logtoUrl: 'https://test.logto.app',
  audience: 'urn:logto:resource:api',
}

describe('JWT Verification Logic', () => {
  beforeEach(() => {
    // resetAllMocks() clears both call history AND the mockResolvedValueOnce queue.
    // clearAllMocks() only clears call history — stale queued values bleed across tests.
    vi.resetAllMocks()
  })

  describe('Token Format Validation', () => {
    it('should reject invalid JWT format (no dots)', async () => {
      const invalidToken = 'invalidentoken'

      await expect(verifyLogtoToken(invalidToken, mockOptions)).rejects.toThrow()
    })

    it('should reject JWT with only one part', async () => {
      const invalidToken = 'header.'

      await expect(verifyLogtoToken(invalidToken, mockOptions)).rejects.toThrow()
    })

    it('should reject empty token', async () => {
      const emptyToken = ''

      await expect(verifyLogtoToken(emptyToken, mockOptions)).rejects.toThrow()
    })
  })

  describe('JWKS Fetching', () => {
    it('should fetch JWKS from correct URL', async () => {
      const mockToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6InRlc3Qta2lkIn0.payload.signature'
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          keys: [
            {
              kid: 'test-kid',
              kty: 'RSA',
              n: 'test-n',
              e: 'AQAB',
            },
          ],
        }),
      })

      const { importJWK: _importJWK, jwtVerify } = await import('jose')
      ;(jwtVerify as any).mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          iss: 'https://test.logto.app/oidc',
          aud: 'urn:logto:resource:api',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      })

      try {
        await verifyLogtoToken(mockToken, mockOptions)
      } catch (e) {
        // Expected to fail due to mocking, but verifies JWKS fetch was attempted
      }

      expect(global.fetch).toHaveBeenCalledWith('https://test.logto.app/oidc/jwks')
    })

    it('should handle JWKS fetch failure', async () => {
      const mockToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6InRlc3Qta2lkIn0.payload.signature'
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })

      await expect(verifyLogtoToken(mockToken, mockOptions)).rejects.toThrow()
    })

    it('should cache JWKS responses (cache hit within TTL avoids second fetch)', async () => {
      // Use a unique URL so this test gets a fresh cache entry unaffected by other tests.
      const cacheUrl = 'https://cache-hit-test.logto.app'
      const cacheOptions: VerifyAuthOptions = { logtoUrl: cacheUrl, audience: 'urn:logto:resource:api' }
      const mockToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6InRlc3Qta2lkIn0.payload.signature'
      const mockJwks = {
        ok: true,
        json: async () => ({ keys: [{ kid: 'test-kid', kty: 'RSA', n: 'n', e: 'AQAB' }] }),
      }
      const makePayload = () => ({
        sub: 'user-123',
        iss: `${cacheUrl}/oidc`,
        aud: 'urn:logto:resource:api',
        exp: Math.floor(Date.now() / 1000) + 3600,
      })

      // First call: cold cache → fetch is called
      ;(global.fetch as any).mockResolvedValueOnce(mockJwks)
      const { jwtVerify } = await import('jose')
      ;(jwtVerify as any).mockResolvedValueOnce({ payload: makePayload() })
      await verifyLogtoToken(mockToken, cacheOptions)

      // Reset call count but keep the cache warm (clearAllMocks was NOT called between calls)
      ;(global.fetch as any).mockClear()
      ;(jwtVerify as any).mockResolvedValueOnce({ payload: makePayload() })

      // Second call: warm cache → fetch should NOT be called again
      await verifyLogtoToken(mockToken, cacheOptions)
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('should refetch JWKS after cache TTL expires', async () => {
      vi.useFakeTimers()
      try {
        const cacheUrl = 'https://cache-ttl-test.logto.app'
        const cacheOptions: VerifyAuthOptions = { logtoUrl: cacheUrl, audience: 'urn:logto:resource:api' }
        const mockToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6InRlc3Qta2lkIn0.payload.signature'
        const mockJwks = {
          ok: true,
          json: async () => ({ keys: [{ kid: 'test-kid', kty: 'RSA', n: 'n', e: 'AQAB' }] }),
        }
        // exp must account for the faked current time
        const makePayload = () => ({
          sub: 'user-123',
          iss: `${cacheUrl}/oidc`,
          aud: 'urn:logto:resource:api',
          exp: Math.floor(Date.now() / 1000) + 7200, // +2 h so it stays valid after advancing 5 min
        })

        const { jwtVerify } = await import('jose')

        // First call — populates cache
        ;(global.fetch as any).mockResolvedValueOnce(mockJwks)
        ;(jwtVerify as any).mockResolvedValueOnce({ payload: makePayload() })
        await verifyLogtoToken(mockToken, cacheOptions)

        // Advance clock past the 5-minute TTL
        vi.advanceTimersByTime(5 * 60 * 1000 + 1000)

        // Second call — cache entry expired, must re-fetch
        ;(global.fetch as any).mockResolvedValueOnce(mockJwks)
        ;(jwtVerify as any).mockResolvedValueOnce({ payload: makePayload() })
        await verifyLogtoToken(mockToken, cacheOptions)

        expect(global.fetch).toHaveBeenCalledTimes(2)
      } finally {
        vi.useRealTimers()
      }
    })

    it('should invalidate cache and retry once on key-rotation error', async () => {
      const rotationUrl = 'https://cache-rotation-test.logto.app'
      const rotationOptions: VerifyAuthOptions = { logtoUrl: rotationUrl, audience: 'urn:logto:resource:api' }
      const mockToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6InRlc3Qta2lkIn0.payload.signature'
      const mockJwks = {
        ok: true,
        json: async () => ({ keys: [{ kid: 'test-kid', kty: 'RSA', n: 'n', e: 'AQAB' }] }),
      }
      const successPayload = {
        sub: 'user-123',
        iss: `${rotationUrl}/oidc`,
        aud: 'urn:logto:resource:api',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }

      const { jwtVerify } = await import('jose')

      // First JWKS fetch (initial cache population) + second fetch (after cache invalidation)
      ;(global.fetch as any).mockResolvedValueOnce(mockJwks)
      ;(global.fetch as any).mockResolvedValueOnce(mockJwks)

      // First jwtVerify: simulate key-rotation signature failure
      const rotationError = Object.assign(new Error('Signature verification failed'), {
        code: 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
      })
      ;(jwtVerify as any).mockRejectedValueOnce(rotationError)
      // Second jwtVerify (retry with fresh keys): success
      ;(jwtVerify as any).mockResolvedValueOnce({ payload: successPayload })

      const result = await verifyLogtoToken(mockToken, rotationOptions)

      // fetch was called twice: initial + retry after cache invalidation
      expect(global.fetch).toHaveBeenCalledTimes(2)
      expect(result.isAuthenticated).toBe(true)
      expect(result.userId).toBe('user-123')
    })
  })

  describe('Claim Validation', () => {
    it('should validate issuer claim', async () => {
      const mockToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6InRlc3Qta2lkIn0.payload.signature'
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          keys: [
            {
              kid: 'test-kid',
              kty: 'RSA',
              n: 'test-n',
              e: 'AQAB',
            },
          ],
        }),
      })

      const { jwtVerify } = await import('jose')
      ;(jwtVerify as any).mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          iss: 'https://invalid.logto.app/oidc',
          aud: 'urn:logto:resource:api',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      })

      await expect(verifyLogtoToken(mockToken, mockOptions)).rejects.toThrow('Invalid issuer')
    })

    it('should validate audience claim', async () => {
      const mockToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6InRlc3Qta2lkIn0.payload.signature'
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          keys: [
            {
              kid: 'test-kid',
              kty: 'RSA',
              n: 'test-n',
              e: 'AQAB',
            },
          ],
        }),
      })

      const { jwtVerify } = await import('jose')
      ;(jwtVerify as any).mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          iss: 'https://test.logto.app/oidc',
          aud: 'urn:logto:resource:wrong',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      })

      await expect(verifyLogtoToken(mockToken, mockOptions)).rejects.toThrow('Invalid audience')
    })

    it('should reject expired tokens', async () => {
      const mockToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6InRlc3Qta2lkIn0.payload.signature'
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          keys: [
            {
              kid: 'test-kid',
              kty: 'RSA',
              n: 'test-n',
              e: 'AQAB',
            },
          ],
        }),
      })

      const { jwtVerify } = await import('jose')
      ;(jwtVerify as any).mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          iss: 'https://test.logto.app/oidc',
          aud: 'urn:logto:resource:api',
          exp: Math.floor(Date.now() / 1000) - 3600, // Expired
        },
      })

      await expect(verifyLogtoToken(mockToken, mockOptions)).rejects.toThrow('expired')
    })

    it('should reject tokens not yet valid', async () => {
      const mockToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6InRlc3Qta2lkIn0.payload.signature'
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          keys: [
            {
              kid: 'test-kid',
              kty: 'RSA',
              n: 'test-n',
              e: 'AQAB',
            },
          ],
        }),
      })

      const { jwtVerify } = await import('jose')
      ;(jwtVerify as any).mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          iss: 'https://test.logto.app/oidc',
          aud: 'urn:logto:resource:api',
          exp: Math.floor(Date.now() / 1000) + 3600,
          nbf: Math.floor(Date.now() / 1000) + 3600, // Not valid yet
        },
      })

      await expect(verifyLogtoToken(mockToken, mockOptions)).rejects.toThrow('not yet valid')
    })

    it('should validate required scope when provided', async () => {
      const mockToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6InRlc3Qta2lkIn0.payload.signature'
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          keys: [
            {
              kid: 'test-kid',
              kty: 'RSA',
              n: 'test-n',
              e: 'AQAB',
            },
          ],
        }),
      })

      const { jwtVerify } = await import('jose')
      ;(jwtVerify as any).mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          iss: 'https://test.logto.app/oidc',
          aud: 'urn:logto:resource:api',
          exp: Math.floor(Date.now() / 1000) + 3600,
          scope: 'read',
        },
      })

      const optionsWithScope: VerifyAuthOptions = {
        ...mockOptions,
        requiredScope: 'write',
      }

      await expect(verifyLogtoToken(mockToken, optionsWithScope)).rejects.toThrow('Missing required scope')
    })
  })

  describe('Successful Token Verification', () => {
    it('should return auth context for valid token', async () => {
      const mockToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6InRlc3Qta2lkIn0.payload.signature'
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          keys: [
            {
              kid: 'test-kid',
              kty: 'RSA',
              n: 'test-n',
              e: 'AQAB',
            },
          ],
        }),
      })

      const { jwtVerify } = await import('jose')
      ;(jwtVerify as any).mockResolvedValueOnce({
        payload: {
          sub: 'user-123',
          iss: 'https://test.logto.app/oidc',
          aud: 'urn:logto:resource:api',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      })

      const result = await verifyLogtoToken(mockToken, mockOptions)

      expect(result).toEqual({
        userId: 'user-123',
        isAuthenticated: true,
        payload: expect.any(Object),
        isGuest: false,
      })
    })
  })

  // ---------------------------------------------------------------------------
  // Task 5.4 — verifyTokenClaims / validatePayloadShape edge cases
  // These tests exercise claim validation paths that the base suite doesn't cover:
  // audience as a string array (RFC 7519), missing/empty sub, missing iss,
  // malformed exp, and an expired-at-exactly-now token.
  // ---------------------------------------------------------------------------

  /** Shared JWKS mock used by the edge-case tests */
  const edgeCaseMockJwks = {
    ok: true,
    json: async () => ({ keys: [{ kid: 'test-kid', kty: 'RSA', n: 'n', e: 'AQAB' }] }),
  }

  describe('verifyTokenClaims — audience array (RFC 7519)', () => {
    const mockToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6InRlc3Qta2lkIn0.payload.signature'

    it('should accept aud as string array when the expected audience is included', async () => {
      (global.fetch as any).mockResolvedValueOnce(edgeCaseMockJwks)
      const { jwtVerify } = await import('jose')
      ;(jwtVerify as any).mockResolvedValueOnce({
        payload: {
          sub: 'user-aud-array',
          iss: 'https://test.logto.app/oidc',
          aud: ['urn:logto:resource:api', 'urn:logto:resource:other'],
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      })

      const result = await verifyLogtoToken(mockToken, mockOptions)
      expect(result.isAuthenticated).toBe(true)
      expect(result.userId).toBe('user-aud-array')
    })

    it('should reject aud as string array when the expected audience is NOT included', async () => {
      (global.fetch as any).mockResolvedValueOnce(edgeCaseMockJwks)
      const { jwtVerify } = await import('jose')
      ;(jwtVerify as any).mockResolvedValueOnce({
        payload: {
          sub: 'user-aud-mismatch',
          iss: 'https://test.logto.app/oidc',
          aud: ['urn:logto:resource:wrong', 'urn:logto:resource:other'],
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      })

      await expect(verifyLogtoToken(mockToken, mockOptions)).rejects.toThrow('Invalid audience')
    })

    it('should skip audience validation when options.audience is not provided', async () => {
      const noAudOptions: VerifyAuthOptions = { logtoUrl: 'https://test.logto.app' }
      ;(global.fetch as any).mockResolvedValueOnce(edgeCaseMockJwks)
      const { jwtVerify } = await import('jose')
      ;(jwtVerify as any).mockResolvedValueOnce({
        payload: {
          sub: 'user-no-aud-check',
          iss: 'https://test.logto.app/oidc',
          // aud deliberately omitted — no audience option, so check is skipped
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      })

      // Should succeed — no audience option means the check is not enforced
      const result = await verifyLogtoToken(mockToken, noAudOptions)
      expect(result.isAuthenticated).toBe(true)
    })

    it('should accept a token when options.audience is an array and one value matches', async () => {
      const multiAudienceOptions: VerifyAuthOptions = {
        logtoUrl: 'https://test.logto.app',
        audience: ['urn:logto:resource:admin', 'urn:logto:resource:api'],
      }

      ;(global.fetch as any).mockResolvedValueOnce(edgeCaseMockJwks)
      const { jwtVerify } = await import('jose')
      ;(jwtVerify as any).mockResolvedValueOnce({
        payload: {
          sub: 'user-option-aud-array',
          iss: 'https://test.logto.app/oidc',
          aud: 'urn:logto:resource:api',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      })

      const result = await verifyLogtoToken(mockToken, multiAudienceOptions)
      expect(result.isAuthenticated).toBe(true)
      expect(result.userId).toBe('user-option-aud-array')
    })

    it('should reject a token when options.audience is an array and none of the values match', async () => {
      const multiAudienceOptions: VerifyAuthOptions = {
        logtoUrl: 'https://test.logto.app',
        audience: ['urn:logto:resource:admin', 'urn:logto:resource:billing'],
      }

      ;(global.fetch as any).mockResolvedValueOnce(edgeCaseMockJwks)
      const { jwtVerify } = await import('jose')
      ;(jwtVerify as any).mockResolvedValueOnce({
        payload: {
          sub: 'user-option-aud-array-mismatch',
          iss: 'https://test.logto.app/oidc',
          aud: ['urn:logto:resource:api', 'urn:logto:resource:other'],
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      })

      await expect(verifyLogtoToken(mockToken, multiAudienceOptions)).rejects.toThrow('Invalid audience')
    })
  })

  describe('validatePayloadShape — required field enforcement', () => {
    const mockToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6InRlc3Qta2lkIn0.payload.signature'

    it('should reject a payload with a missing sub field', async () => {
      (global.fetch as any).mockResolvedValueOnce(edgeCaseMockJwks)
      const { jwtVerify } = await import('jose')
      ;(jwtVerify as any).mockResolvedValueOnce({
        payload: {
          // sub intentionally absent
          iss: 'https://test.logto.app/oidc',
          aud: 'urn:logto:resource:api',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      })

      await expect(verifyLogtoToken(mockToken, mockOptions)).rejects.toThrow(/sub/)
    })

    it('should reject a payload with an empty sub field', async () => {
      (global.fetch as any).mockResolvedValueOnce(edgeCaseMockJwks)
      const { jwtVerify } = await import('jose')
      ;(jwtVerify as any).mockResolvedValueOnce({
        payload: {
          sub: '   ', // whitespace-only
          iss: 'https://test.logto.app/oidc',
          aud: 'urn:logto:resource:api',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      })

      await expect(verifyLogtoToken(mockToken, mockOptions)).rejects.toThrow(/sub/)
    })

    it('should reject a payload with a missing iss field', async () => {
      (global.fetch as any).mockResolvedValueOnce(edgeCaseMockJwks)
      const { jwtVerify } = await import('jose')
      ;(jwtVerify as any).mockResolvedValueOnce({
        payload: {
          sub: 'user-no-iss',
          // iss intentionally absent
          aud: 'urn:logto:resource:api',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      })

      await expect(verifyLogtoToken(mockToken, mockOptions)).rejects.toThrow(/iss/)
    })

    it('should reject a payload where exp is a non-numeric type', async () => {
      (global.fetch as any).mockResolvedValueOnce(edgeCaseMockJwks)
      const { jwtVerify } = await import('jose')
      ;(jwtVerify as any).mockResolvedValueOnce({
        payload: {
          sub: 'user-bad-exp',
          iss: 'https://test.logto.app/oidc',
          aud: 'urn:logto:resource:api',
          exp: 'not-a-number', // invalid type
        },
      })

      await expect(verifyLogtoToken(mockToken, mockOptions)).rejects.toThrow(/exp/)
    })

    it('should reject a token with exp one second in the past (exp < now)', async () => {
      vi.useFakeTimers()
      try {
        const now = Math.floor(Date.now() / 1000)
        ;(global.fetch as any).mockResolvedValueOnce(edgeCaseMockJwks)
        const { jwtVerify } = await import('jose')
        ;(jwtVerify as any).mockResolvedValueOnce({
          payload: {
            sub: 'user-boundary-exp',
            iss: 'https://test.logto.app/oidc',
            aud: 'urn:logto:resource:api',
            exp: now - 1, // one second in the past → expired
          },
        })

        await expect(verifyLogtoToken(mockToken, mockOptions)).rejects.toThrow(/expired/)
      } finally {
        vi.useRealTimers()
      }
    })

    it('should reject a payload where aud is neither a string nor string[]', async () => {
      (global.fetch as any).mockResolvedValueOnce(edgeCaseMockJwks)
      const { jwtVerify } = await import('jose')
      ;(jwtVerify as any).mockResolvedValueOnce({
        payload: {
          sub: 'user-bad-aud',
          iss: 'https://test.logto.app/oidc',
          aud: 12345, // invalid type
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      })

      await expect(verifyLogtoToken(mockToken, mockOptions)).rejects.toThrow(/aud/)
    })

    it('should reject a payload where nbf is a non-numeric type', async () => {
      (global.fetch as any).mockResolvedValueOnce(edgeCaseMockJwks)
      const { jwtVerify } = await import('jose')
      ;(jwtVerify as any).mockResolvedValueOnce({
        payload: {
          sub: 'user-bad-nbf',
          iss: 'https://test.logto.app/oidc',
          aud: 'urn:logto:resource:api',
          exp: Math.floor(Date.now() / 1000) + 3600,
          nbf: 'not-a-number', // invalid type — validatePayloadShape must reject this
        },
      })

      await expect(verifyLogtoToken(mockToken, mockOptions)).rejects.toThrow(/nbf/)
    })

    it('should reject a payload where scope is a non-string type', async () => {
      (global.fetch as any).mockResolvedValueOnce(edgeCaseMockJwks)
      const { jwtVerify } = await import('jose')
      ;(jwtVerify as any).mockResolvedValueOnce({
        payload: {
          sub: 'user-bad-scope',
          iss: 'https://test.logto.app/oidc',
          aud: 'urn:logto:resource:api',
          exp: Math.floor(Date.now() / 1000) + 3600,
          scope: 42, // invalid type — must be string
        },
      })

      await expect(verifyLogtoToken(mockToken, mockOptions)).rejects.toThrow(/scope/)
    })
  })
})
