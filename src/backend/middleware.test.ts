import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createExpressAuthMiddleware, verifyNextAuth, verifyLogtoToken } from './verify-auth'
import type { VerifyAuthOptions } from './types'

// Mock jose library
vi.mock('jose', () => ({
  importJWK: vi.fn().mockResolvedValue({}),
  jwtVerify: vi.fn().mockResolvedValue({
    payload: {
      sub: 'user-123',
      iss: 'https://test.logto.app/oidc',
      aud: 'urn:logto:resource:api',
      exp: Math.floor(Date.now() / 1000) + 3600,
      scope: 'read:user',
    },
  }),
}))

// Mock fetch globally
global.fetch = vi.fn()

const mockOptions: VerifyAuthOptions = {
  logtoUrl: 'https://test.logto.app',
  audience: 'urn:logto:resource:api',
}

// Helper to wrap middleware execution and wait for completion
const _executeMiddleware = (middleware: any, req: any, res: any) => {
  return new Promise<void>((resolve, reject) => {
    const nextFn = vi.fn(resolve)

    // If middleware calls next, it resolves
    // If res.status is called, we resolve after json is called
    const originalStatus = res.status
    res.status = vi.fn(function (_code: number) {
      res.json = vi.fn((_data: any) => {
        resolve()
      })
      return this
    })

    try {
      middleware(req, res, nextFn)

      // If middleware completes synchronously without calling next or res, resolve after a tick
      if (!nextFn.called && !originalStatus.called) {
        setTimeout(resolve, 10)
      }
    } catch (error) {
      reject(error)
    }
  })
}

const validToken =
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6InRlc3Qta2lkIn0.eyJzdWIiOiJ1c2VyLTEyMyIsImlzcyI6Imh0dHBzOi8vdGVzdC5sb2d0by5hcHAvb2lkYyIsImF1ZCI6InVybjpsb2d0bzpyZXNvdXJjZTphcGkiLCJleHAiOjk5OTk5OTk5OTksInNjb3BlIjoicmVhZDp1c2VyIn0.signature'

describe('Express/Next.js Middleware Auth Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(global.fetch as any).mockClear()

    // Mock JWKS fetch
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        keys: [
          {
            kid: 'test-kid',
            kty: 'RSA',
            use: 'sig',
            alg: 'RS256',
            n: 'test-n',
            e: 'AQAB',
          },
        ],
      }),
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Express Middleware', () => {
    describe('Token Extraction', () => {
      it('should extract token from cookies', async () => {
        const middleware = createExpressAuthMiddleware(mockOptions)
        const req = {
          cookies: { logto_authtoken: validToken },
          headers: {},
        } as any

        const _res = {
          status: vi.fn().mockReturnThis(),
          json: vi.fn(),
        } as any

        let _nextCalled = false
        const testReq = req
        const testRes = {
          status: vi.fn().mockReturnThis(),
          json: vi.fn(),
        }
        const _nextFn = vi.fn(() => {
          _nextCalled = true
        })

        await new Promise<void>(resolve => {
          middleware(testReq, testRes, () => {
            _nextCalled = true
            resolve()
          })
          setTimeout(resolve, 50)
        })

        expect(_nextCalled).toBe(true)
        expect(testReq.auth).toBeTruthy()
      })

      it('should extract token from Authorization header', async () => {
        const middleware = createExpressAuthMiddleware(mockOptions)
        const req = {
          cookies: {},
          headers: {
            authorization: `Bearer ${validToken}`,
          },
        } as any

        let _nextCalled = false
        const testReq = req
        const testRes = { status: vi.fn().mockReturnThis(), json: vi.fn() }
        const _nextFn = vi.fn(() => {
          _nextCalled = true
        })

        await new Promise<void>(resolve => {
          middleware(testReq, testRes, () => {
            _nextCalled = true
            resolve()
          })
          setTimeout(resolve, 50)
        })

        expect(_nextCalled).toBe(true)
        expect(testReq.auth).toBeTruthy()
      })

      it('should prefer cookie over Authorization header', async () => {
        const middleware = createExpressAuthMiddleware(mockOptions)
        const req = {
          cookies: { logto_authtoken: validToken },
          headers: {
            authorization: 'Bearer different-token',
          },
        } as any

        let nextCalled = false
        const testReq = req
        const testRes = { status: vi.fn().mockReturnThis(), json: vi.fn() }

        await new Promise<void>(resolve => {
          middleware(testReq, testRes, () => {
            nextCalled = true
            resolve()
          })
          setTimeout(resolve, 50)
        })

        expect(nextCalled).toBe(true)
      })

      it('should use custom cookie name', async () => {
        const customOptions = { ...mockOptions, cookieName: 'custom_token' }
        const middleware = createExpressAuthMiddleware(customOptions)
        const req = {
          cookies: { custom_token: validToken },
          headers: {},
        } as any

        let nextCalled = false
        const testReq = req
        const testRes = { status: vi.fn().mockReturnThis(), json: vi.fn() }

        await new Promise<void>(resolve => {
          middleware(testReq, testRes, () => {
            nextCalled = true
            resolve()
          })
          setTimeout(resolve, 50)
        })

        expect(nextCalled).toBe(true)
      })
    })

    describe('Authentication Flow', () => {
      it('should return 401 when no token found and guest mode disabled', async () => {
        const middleware = createExpressAuthMiddleware(mockOptions)

        const req = {
          cookies: {},
          headers: {},
        } as any

        let statusCalled = false
        let statusCode = 0
        const res = {
          status: vi.fn(function (code: number) {
            statusCalled = true
            statusCode = code
            return this
          }),
          json: vi.fn(),
        } as any

        await new Promise<void>(resolve => {
          middleware(req, res, () => {
            resolve()
          })
          setTimeout(resolve, 50)
        })

        expect(statusCalled).toBe(true)
        expect(statusCode).toBe(401)
      })

      it('should attach auth context to request when token is valid', async () => {
        const middleware = createExpressAuthMiddleware(mockOptions)

        const req = {
          cookies: { logto_authtoken: validToken },
          headers: {},
        } as any

        let nextCalled = false
        const res = {
          status: vi.fn().mockReturnThis(),
          json: vi.fn(),
        } as any

        await new Promise<void>(resolve => {
          middleware(req, res, () => {
            nextCalled = true
            resolve()
          })
          setTimeout(resolve, 50)
        })

        expect(req.auth).toBeDefined()
        expect(req.auth.userId).toBe('user-123')
        expect(req.auth.isAuthenticated).toBe(true)
        expect(nextCalled).toBe(true)
      })

      it('should return 401 when token verification fails', async () => {
        // Override the fetch mock to return failure for JWKS
        vi.mocked(global.fetch).mockImplementation(() =>
          Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
          } as any),
        )

        // Use a different logtoUrl to avoid cached JWKS from beforeEach
        const testOptions = { ...mockOptions, logtoUrl: 'https://different.logto.app' }
        const middleware = createExpressAuthMiddleware(testOptions)

        const req = {
          cookies: { logto_authtoken: validToken },
          headers: {},
        } as any

        let statusCode = 0
        const res = {
          status: vi.fn(function (code: number) {
            statusCode = code
            return this
          }),
          json: vi.fn(),
        } as any

        await new Promise<void>(resolve => {
          middleware(req, res, () => {
            resolve()
          })
          setTimeout(resolve, 100)
        })

        expect(statusCode).toBe(401)
      })
    })

    describe('Guest Mode', () => {
      it('should allow guest access when allowGuest is true and no token', async () => {
        const guestOptions = { ...mockOptions, allowGuest: true }
        const middleware = createExpressAuthMiddleware(guestOptions)

        const req = {
          cookies: {},
          headers: {},
        } as any

        let nextCalled = false
        const res = {
          status: vi.fn().mockReturnThis(),
          json: vi.fn(),
        } as any

        await new Promise<void>(resolve => {
          middleware(req, res, () => {
            nextCalled = true
            resolve()
          })
          setTimeout(resolve, 50)
        })

        expect(req.auth).toBeDefined()
        expect(req.auth.isGuest).toBe(true)
        expect(req.auth.isAuthenticated).toBe(false)
        expect(nextCalled).toBe(true)
      })

      it('should fallback to guest mode on token verification failure', async () => {
        vi.mocked(global.fetch).mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        } as any)

        const guestOptions = { ...mockOptions, allowGuest: true }
        const middleware = createExpressAuthMiddleware(guestOptions)

        const req = {
          cookies: { logto_authtoken: 'invalid-token' },
          headers: {},
        } as any

        let nextCalled = false
        const res = {
          status: vi.fn().mockReturnThis(),
          json: vi.fn(),
        } as any

        await new Promise<void>(resolve => {
          middleware(req, res, () => {
            nextCalled = true
            resolve()
          })
          setTimeout(resolve, 50)
        })

        expect(req.auth).toBeDefined()
        expect(req.auth.isGuest).toBe(true)
        expect(nextCalled).toBe(true)
      })

      it('should leave guestId undefined when no guest cookie present', async () => {
        const guestOptions = { ...mockOptions, allowGuest: true }
        const middleware = createExpressAuthMiddleware(guestOptions)

        const req = {
          cookies: {},
          headers: {},
        } as any

        let _nextCalled = false
        const res = {
          status: vi.fn().mockReturnThis(),
          json: vi.fn(),
        } as any

        await new Promise<void>(resolve => {
          middleware(req, res, () => {
            _nextCalled = true
            resolve()
          })
          setTimeout(resolve, 50)
        })

        expect(req.auth).toBeDefined()
        expect(req.auth.isGuest).toBe(true)
        // No guest cookie was present — backend must not fabricate an ID
        expect(req.auth.guestId).toBeUndefined()
      })
    })

    describe('Cookie Parsing', () => {
      it('should parse cookies if not already available', async () => {
        const middleware = createExpressAuthMiddleware(mockOptions)

        const req = {
          cookies: undefined,
          headers: {},
        } as any

        const res = {
          status: vi.fn().mockReturnThis(),
          json: vi.fn(),
        } as any

        // Middleware should handle missing cookies gracefully by parsing them first
        await new Promise<void>(resolve => {
          middleware(req, res, () => {
            resolve()
          })
          setTimeout(resolve, 50)
        })

        expect(req.cookies !== undefined || res.status.called).toBe(true)
      })
    })

    describe('Error Handling', () => {
      it('should return appropriate error message on failure', async () => {
        const middleware = createExpressAuthMiddleware(mockOptions)

        const req = {
          cookies: {},
          headers: {},
        } as any

        const res = {
          status: vi.fn().mockReturnThis(),
          json: vi.fn(),
        } as any

        await new Promise<void>(resolve => {
          middleware(req, res, () => {
            resolve()
          })
          setTimeout(resolve, 50)
        })

        expect(res.status).toHaveBeenCalledWith(401)
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Authentication required',
          }),
        )
      })
    })
  })

  describe('Next.js Middleware', () => {
    describe('Token Extraction from Next.js Request', () => {
      it('should extract token from Next.js cookies', async () => {
        const cookieMock = {
          get: vi.fn((name: string) => {
            if (name === 'logto_authtoken') {
              return { value: validToken }
            }
            return undefined
          }),
        }

        const request = {
          cookies: cookieMock,
          headers: {
            get: vi.fn(() => null),
          },
        } as any

        const result = await verifyNextAuth(request, mockOptions)

        expect(result.success).toBe(true)
        expect(result.auth?.userId).toBe('user-123')
      })

      it('should extract token from Next.js Authorization header', async () => {
        const request = {
          cookies: {
            get: vi.fn(() => null),
          },
          headers: {
            get: vi.fn((name: string) => {
              if (name === 'authorization') {
                return `Bearer ${validToken}`
              }
              return null
            }),
          },
        } as any

        const result = await verifyNextAuth(request, mockOptions)

        expect(result.success).toBe(true)
        expect(result.auth?.userId).toBe('user-123')
      })

      it('should prefer Next.js cookie over Authorization header', async () => {
        const cookieMock = {
          get: vi.fn((name: string) => {
            if (name === 'logto_authtoken') {
              return { value: validToken }
            }
            return undefined
          }),
        }

        const request = {
          cookies: cookieMock,
          headers: {
            get: vi.fn((name: string) => {
              if (name === 'authorization') {
                return 'Bearer different-token'
              }
              return null
            }),
          },
        } as any

        const result = await verifyNextAuth(request, mockOptions)

        expect(result.success).toBe(true)
      })
    })

    describe('Next.js Authentication Flow', () => {
      it('should return success with auth context when token is valid', async () => {
        const request = {
          cookies: {
            get: vi.fn((name: string) => {
              if (name === 'logto_authtoken') {
                return { value: validToken }
              }
            }),
          },
          headers: {
            get: vi.fn(() => null),
          },
        } as any

        const result = await verifyNextAuth(request, mockOptions)

        expect(result.success).toBe(true)
        expect(result.auth).toBeDefined()
        expect(result.auth?.userId).toBe('user-123')
        expect(result.auth?.isAuthenticated).toBe(true)
      })

      it('should return error when no token found and guest mode disabled', async () => {
        const request = {
          cookies: {
            get: vi.fn(() => null),
          },
          headers: {
            get: vi.fn(() => null),
          },
        } as any

        const result = await verifyNextAuth(request, mockOptions)

        expect(result.success).toBe(false)
        expect(result.error).toContain('No token found')
      })

      it('should return error with proper message on token verification failure', async () => {
        vi.mocked(global.fetch).mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        } as any)

        const request = {
          cookies: {
            get: vi.fn((name: string) => {
              if (name === 'logto_authtoken') {
                return { value: 'invalid-token' }
              }
            }),
          },
          headers: {
            get: vi.fn(() => null),
          },
        } as any

        const result = await verifyNextAuth(request, mockOptions)

        expect(result.success).toBe(false)
      })
    })

    describe('Next.js Guest Mode', () => {
      it('should allow guest access when allowGuest is true and no token', async () => {
        const guestOptions = { ...mockOptions, allowGuest: true }

        const request = {
          cookies: {
            get: vi.fn(() => null),
          },
          headers: {
            get: vi.fn(() => null),
          },
        } as any

        const result = await verifyNextAuth(request, guestOptions)

        // Guest sessions are success:true — callers use auth.isGuest to distinguish
        expect(result.success).toBe(true)
        expect(result.auth?.isGuest).toBe(true)
        expect(result.auth?.isAuthenticated).toBe(false)
      })

      it('should fallback to guest mode on token verification failure', async () => {
        vi.mocked(global.fetch).mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        } as any)

        const guestOptions = { ...mockOptions, allowGuest: true }

        const request = {
          cookies: {
            get: vi.fn((name: string) => {
              if (name === 'logto_authtoken') {
                return { value: 'invalid-token' }
              }
            }),
          },
          headers: {
            get: vi.fn(() => null),
          },
        } as any

        const result = await verifyNextAuth(request, guestOptions)

        // Guest fallback is a valid session — success:true, callers check auth.isGuest
        expect(result.success).toBe(true)
        expect(result.auth?.isGuest).toBe(true)
      })

      it('should preserve guest ID from cookie in guest mode', async () => {
        const guestOptions = { ...mockOptions, allowGuest: true }

        const cookieMock = {
          get: vi.fn((name: string) => {
            if (name === 'guest_logto_authtoken') {
              return { value: 'guest-123' }
            }
            return null
          }),
        }

        const request = {
          cookies: cookieMock,
          headers: {
            get: vi.fn(() => null),
          },
        } as any

        const result = await verifyNextAuth(request, guestOptions)

        expect(result.auth?.isGuest).toBe(true)
        expect(result.auth?.guestId).toBe('guest-123')
      })
    })

    describe('Response Structure', () => {
      it('should return success: true with auth context on valid token', async () => {
        const request = {
          cookies: {
            get: vi.fn((name: string) => {
              if (name === 'logto_authtoken') {
                return { value: validToken }
              }
            }),
          },
          headers: {
            get: vi.fn(() => null),
          },
        } as any

        const result = await verifyNextAuth(request, mockOptions)

        expect(result).toHaveProperty('success', true)
        expect(result).toHaveProperty('auth')
        expect(result).not.toHaveProperty('error')
      })

      it('should return success: false with error message on failure', async () => {
        const request = {
          cookies: {
            get: vi.fn(() => null),
          },
          headers: {
            get: vi.fn(() => null),
          },
        } as any

        const result = await verifyNextAuth(request, mockOptions)

        expect(result).toHaveProperty('success', false)
        expect(result).toHaveProperty('error')
      })

      it('should return auth context with success:true when guest mode enabled', async () => {
        const guestOptions = { ...mockOptions, allowGuest: true }

        const request = {
          cookies: {
            get: vi.fn(() => null),
          },
          headers: {
            get: vi.fn(() => null),
          },
        } as any

        const result = await verifyNextAuth(request, guestOptions)

        // A valid guest session returns success:true so callers don't have to treat
        // guests as an error — they use auth.isGuest to distinguish the two cases.
        expect(result).toHaveProperty('success', true)
        expect(result).toHaveProperty('auth')
        expect(result.auth?.isGuest).toBe(true)
      })
    })
  })

  describe('Token Verification Core', () => {
    it('should verify valid token successfully', async () => {
      const result = await verifyLogtoToken(validToken, mockOptions)

      expect(result.userId).toBe('user-123')
      expect(result.isAuthenticated).toBe(true)
      expect(result.isGuest).toBe(false)
    })

    it('should throw error for invalid token format', async () => {
      await expect(verifyLogtoToken('invalid-token', mockOptions)).rejects.toThrow()
    })

    it('should include payload in auth context', async () => {
      const result = await verifyLogtoToken(validToken, mockOptions)

      expect(result.payload).toBeDefined()
      expect(result.payload?.sub).toBe('user-123')
    })

    it('should respect required scope validation', async () => {
      const scopeOptions = { ...mockOptions, requiredScope: 'read:user' }

      const result = await verifyLogtoToken(validToken, scopeOptions)

      expect(result.isAuthenticated).toBe(true)
    })
  })
})
