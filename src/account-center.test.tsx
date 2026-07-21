import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AccountCenter } from './account-center.js'
import type { AccountClient } from './account.js'

const createClient = (): AccountClient => ({
  getProfile: vi.fn().mockResolvedValue({ id: 'user-1', name: 'Ada', username: 'ada', primaryEmail: 'ada@example.test' }),
  updateProfile: vi.fn().mockImplementation(async (value) => ({ id: 'user-1', ...value })),
  updateStandardProfile: vi.fn(),
  verifyPassword: vi.fn().mockResolvedValue({ verificationRecordId: 'verification-1', expiresAt: 'later' }),
  requestVerificationCode: vi.fn(),
  verifyCode: vi.fn(),
  updatePassword: vi.fn(),
  updatePrimaryEmail: vi.fn(),
  removePrimaryEmail: vi.fn(),
  updatePrimaryPhone: vi.fn(),
  removePrimaryPhone: vi.fn(),
  beginSocialLink: vi.fn(),
  verifySocialLink: vi.fn(),
  linkSocialIdentity: vi.fn(),
  removeSocialIdentity: vi.fn(),
  listMfa: vi.fn().mockResolvedValue([]),
  generateTotpSecret: vi.fn(),
  bindTotp: vi.fn(),
  generateBackupCodes: vi.fn(),
  bindBackupCodes: vi.fn(),
  listBackupCodes: vi.fn(),
  deleteMfa: vi.fn(),
  beginPasskeyRegistration: vi.fn(),
  verifyPasskeyRegistration: vi.fn(),
  linkPasskey: vi.fn(),
  getMfaSettings: vi.fn(),
  updateMfaSettings: vi.fn(),
  listSessions: vi.fn().mockResolvedValue([]),
  revokeSession: vi.fn(),
  listGrants: vi.fn().mockResolvedValue([]),
  revokeGrant: vi.fn(),
  deleteAccount: vi.fn(),
}) as AccountClient

describe('AccountCenter', () => {
  it('renders and edits direct Account API profile data', async () => {
    const client = createClient()
    render(<AccountCenter client={client} />)
    expect(await screen.findByDisplayValue('Ada')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Ada Lovelace' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    await waitFor(() => expect(client.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ada Lovelace' })))
  })

  it('requires recent verification before listing sessions', async () => {
    const client = createClient()
    render(<AccountCenter client={client} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sessions' }))
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'correct horse' } })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock settings' }))
    await waitFor(() => expect(client.listSessions).toHaveBeenCalledWith('verification-1'))
  })
})
