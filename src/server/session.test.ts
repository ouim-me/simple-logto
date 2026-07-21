import { describe, expect, it, vi } from 'vitest'
import { createAuthSessionMiddleware, openAuthSession, openAuthSessionWithFallback, sealAuthSession } from './session.js'

describe('encrypted application sessions', () => {
  const secret = 'a-long-development-secret-that-is-never-shared'

  it('encrypts an upstream token and restores its session metadata', async () => {
    const value = await sealAuthSession('upstream.jwt.token', secret, 60)
    expect(value).not.toContain('upstream.jwt.token')
    await expect(openAuthSession(value, secret)).resolves.toEqual(expect.objectContaining({ accessToken: 'upstream.jwt.token' }))
  })

  it('rejects expired sessions', async () => {
    const value = await sealAuthSession('token', secret, 1)
    await expect(openAuthSession(value, secret, Math.floor(Date.now() / 1000) + 2)).rejects.toThrow('expired')
  })

  it('supports key rotation fallback', async () => {
    const value = await sealAuthSession('token', secret, 60)
    await expect(openAuthSessionWithFallback(value, ['another-secret-that-is-at-least-thirty-two', secret])).resolves.toEqual(
      expect.objectContaining({ accessToken: 'token' }),
    )
  })

  it('hydrates a cookie session for downstream bearer verification', async () => {
    const value = await sealAuthSession('token', secret, 60)
    const request = { headers: { cookie: `logto_authsession=${encodeURIComponent(value)}` } }
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }
    const next = vi.fn()
    createAuthSessionMiddleware({ secrets: [secret] })(request, response, next)
    await vi.waitFor(() => expect(next).toHaveBeenCalled())
    expect(request.headers).toHaveProperty('authorization', 'Bearer token')
  })
})
