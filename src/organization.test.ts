import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOrganizationClient } from './organization.js'

describe('organization HTTP adapter', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses an application token for the organization list', async () => {
    const getToken = vi.fn().mockResolvedValue('app-token')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) })
    vi.stubGlobal('fetch', fetchMock)
    const client = createOrganizationClient('/identity', getToken)

    await expect(client.list()).resolves.toEqual([])
    expect(getToken).toHaveBeenCalledWith(undefined)
    expect(fetchMock).toHaveBeenCalledWith('/identity/organizations', expect.any(Object))
  })

  it('requests an organization token for member operations', async () => {
    const getToken = vi.fn().mockResolvedValue('organization-token')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }))
    const client = createOrganizationClient('/identity', getToken)

    await client.members('org/one')
    expect(getToken).toHaveBeenCalledWith('org/one')
  })

  it('does not hide backend authorization failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ message: 'Missing permission.' }) }))
    const client = createOrganizationClient('/identity', async () => 'token')
    await expect(client.removeMember('org-1', 'user-1')).rejects.toThrow('Missing permission.')
  })
})
