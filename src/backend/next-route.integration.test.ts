import { beforeEach, describe, expect, it, vi } from 'vitest'
import { jwtVerify } from 'jose'
import { verifyNextAuth } from './verify-auth'
import type { AuthPayload, NextRequest, VerifyAuthOptions } from './types'

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

type RouteHandlerRequest = {
  headers: Headers
}

function createRouteRequest(init?: HeadersInit): RouteHandlerRequest {
  return {
    headers: new Headers(init),
  }
}

function createNextRequest(request: RouteHandlerRequest): NextRequest {
  const cookieHeader = request.headers.get('cookie') ?? ''
  const cookies = new Map(
    cookieHeader
      .split(';')
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        const separatorIndex = part.indexOf('=')
        if (separatorIndex === -1) {
          return [part, '']
        }

        const name = decodeURIComponent(part.slice(0, separatorIndex))
        const value = decodeURIComponent(part.slice(separatorIndex + 1))
        return [name, value]
      }),
  )

  return {
    cookies: {
      get(name: string) {
        const value = cookies.get(name)
        return value === undefined ? undefined : { value }
      },
    },
    headers: {
      get(name: string) {
        return request.headers.get(name)
      },
    },
  }
}

async function routeHandler(request: RouteHandlerRequest, options: VerifyAuthOptions): Promise<Response> {
  const result = await verifyNextAuth(createNextRequest(request), options)

  if (!result.success) {
    return new Response(JSON.stringify({ error: result.error }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ auth: result.auth }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('verifyNextAuth route handler integration', () => {
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

  it('returns an authenticated session for a valid JWT', async () => {
    const logtoUrl = 'https://test.logto.app/next-valid'
    vi.mocked(jwtVerify).mockResolvedValueOnce({
      payload: buildPayload(logtoUrl),
      protectedHeader: {},
    } as never)

    const response = await routeHandler(
      createRouteRequest({
        cookie: `logto_authtoken=${validToken}`,
      }),
      {
        logtoUrl,
        audience: 'urn:logto:resource:api',
      },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      auth: {
        userId: 'user-123',
        isAuthenticated: true,
        isGuest: false,
      },
    })
  })

  it('returns an authenticated session for a valid Bearer token header', async () => {
    const logtoUrl = 'https://test.logto.app/next-bearer'
    vi.mocked(jwtVerify).mockResolvedValueOnce({
      payload: buildPayload(logtoUrl),
      protectedHeader: {},
    } as never)

    const response = await routeHandler(
      createRouteRequest({
        authorization: `Bearer ${validToken}`,
      }),
      {
        logtoUrl,
        audience: 'urn:logto:resource:api',
      },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      auth: {
        userId: 'user-123',
        isAuthenticated: true,
        isGuest: false,
      },
    })
  })

  it('returns a guest session when allowGuest is enabled and a guest cookie is present', async () => {
    const response = await routeHandler(
      createRouteRequest({
        cookie: 'guest_logto_authtoken=guest-456',
      }),
      {
        logtoUrl: 'https://test.logto.app/next-guest',
        audience: 'urn:logto:resource:api',
        allowGuest: true,
      },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      auth: {
        userId: null,
        isAuthenticated: false,
        isGuest: true,
        guestId: 'guest-456',
      },
    })
  })

  it('returns 401 when no token is provided', async () => {
    const response = await routeHandler(
      createRouteRequest(),
      {
        logtoUrl: 'https://test.logto.app/next-missing',
        audience: 'urn:logto:resource:api',
      },
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      error: 'No token found in cookies or Authorization header',
    })
  })

  it('does not fall back to guest mode when allowGuest is explicitly false', async () => {
    const response = await routeHandler(
      createRouteRequest(),
      {
        logtoUrl: 'https://test.logto.app/next-no-guest',
        audience: 'urn:logto:resource:api',
        allowGuest: false,
      },
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      error: 'No token found in cookies or Authorization header',
    })
  })
})
