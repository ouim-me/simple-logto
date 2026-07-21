import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountApiError, createAccountClient } from './account.js'

describe('Account API client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('calls Logto directly with the signed-in user token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'user-1' }) })
    vi.stubGlobal('fetch', fetchMock)
    const client = createAccountClient('https://identity.example.test/', async () => 'account-token')

    await expect(client.getProfile()).resolves.toEqual({ id: 'user-1' })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://identity.example.test/api/my-account',
      expect.objectContaining({ headers: expect.objectContaining({ authorization: 'Bearer account-token' }) }),
    )
  })

  it('passes verification records only to sensitive operations', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)
    const client = createAccountClient('https://identity.example.test', async () => 'token')

    await client.updatePassword('new-password', 'verification-1')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://identity.example.test/api/my-account/password',
      expect.objectContaining({ headers: expect.objectContaining({ 'logto-verification-id': 'verification-1' }) }),
    )
  })

  it('normalizes provider failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ code: 'verification_record.permission_denied', message: 'Verification required.' }) }))
    const client = createAccountClient('https://identity.example.test', async () => 'token')
    await expect(client.getProfile()).rejects.toEqual(
      new AccountApiError('Verification required.', 403, 'verification_record.permission_denied'),
    )
  })
})
