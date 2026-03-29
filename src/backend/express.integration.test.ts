import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { jwtVerify } from 'jose'
import { createExpressAuthMiddleware } from './verify-auth'
import type { AuthPayload, VerifyAuthOptions } from './types'

vi.mock('jose', () => ({
  importJWK: vi.fn().mockResolvedValue({}),
  jwtVerify: vi.fn(),
}))

const validToken =
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6InRlc3Qta2lkIn0.eyJzdWIiOiJ1c2VyLTEyMyIsImlzcyI6Imh0dHBzOi8vdGVzdC5sb2d0by5hcHAvb2lkYyIsImF1ZCI6InVybjpsb2d0bzpyZXNvdXJjZTphcGkiLCJleHAiOjk5OTk5OTk5OTksInNjb3BlIjoicmVhZDp1c2VyIn0.signature'

function buildPayload(logtoUrl: string, overrides: Partial<AuthPayload> = {}): AuthPayload {
  return {
    sub: 'user-123',
    iss: `${logtoUrl}/oidc`,
    aud: 'urn:logto:resource:api',
    exp: Math.floor(Date.now() / 1000) + 3600,
    scope: 'read:user',
    ...overrides,
  }
}

function buildApp(options: VerifyAuthOptions) {
  const app = express()
  app.use(createExpressAuthMiddleware(options))
  app.get('/session', (req, res) => {
    res.json({
      auth: req.auth ?? null,
    })
  })

  return app
}

describe('createExpressAuthMiddleware integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn().mockResolvedValue({
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
    }) as typeof fetch

  })

  it('accepts a valid JWT from cookies and exposes the auth context on the request', async () => {
    const logtoUrl = 'https://test.logto.app/express-valid'
    vi.mocked(jwtVerify).mockResolvedValueOnce({
      payload: buildPayload(logtoUrl),
      protectedHeader: {},
    } as never)

    const app = buildApp({
      logtoUrl,
      audience: 'urn:logto:resource:api',
    })

    const response = await request(app)
      .get('/session')
      .set('Cookie', [`logto_authtoken=${validToken}`])

    expect(response.status).toBe(200)
    expect(response.body.auth).toMatchObject({
      userId: 'user-123',
      isAuthenticated: true,
      isGuest: false,
    })
  })

  it('rejects expired JWTs', async () => {
    const logtoUrl = 'https://test.logto.app/express-expired'
    vi.mocked(jwtVerify).mockResolvedValueOnce({
      payload: buildPayload(logtoUrl, {
        exp: Math.floor(Date.now() / 1000) - 10,
      }),
      protectedHeader: {},
    } as never)

    const app = buildApp({
      logtoUrl,
      audience: 'urn:logto:resource:api',
    })

    const response = await request(app)
      .get('/session')
      .set('Cookie', [`logto_authtoken=${validToken}`])

    expect(response.status).toBe(401)
    expect(response.body).toMatchObject({
      error: 'Authentication failed',
    })
    expect(response.body.message).toContain('Token has expired')
  })

  it('returns 401 when no JWT is present and guest mode is disabled', async () => {
    const app = buildApp({
      logtoUrl: 'https://test.logto.app/express-missing',
      audience: 'urn:logto:resource:api',
    })

    const response = await request(app).get('/session')

    expect(response.status).toBe(401)
    expect(response.body).toMatchObject({
      error: 'Authentication required',
      message: 'No token found in cookies or Authorization header',
    })
  })

  it('allows guest sessions and preserves the guest cookie id', async () => {
    const app = buildApp({
      logtoUrl: 'https://test.logto.app/express-guest',
      audience: 'urn:logto:resource:api',
      allowGuest: true,
    })

    const response = await request(app)
      .get('/session')
      .set('Cookie', ['guest_logto_authtoken=guest-123'])

    expect(response.status).toBe(200)
    expect(response.body.auth).toMatchObject({
      userId: null,
      isAuthenticated: false,
      isGuest: true,
      guestId: 'guest-123',
    })
  })

  it('enforces required scopes and rejects tokens that do not include them', async () => {
    const logtoUrl = 'https://test.logto.app/express-scope'
    vi.mocked(jwtVerify).mockResolvedValueOnce({
      payload: buildPayload(logtoUrl),
      protectedHeader: {},
    } as never)

    const app = buildApp({
      logtoUrl,
      audience: 'urn:logto:resource:api',
      requiredScope: 'write:user',
    })

    const response = await request(app)
      .get('/session')
      .set('Cookie', [`logto_authtoken=${validToken}`])

    expect(response.status).toBe(401)
    expect(response.body).toMatchObject({
      error: 'Authentication failed',
    })
    expect(response.body.message).toContain('Missing required scope: write:user')
  })
})
