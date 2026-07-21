'use client'

import { useCallback, useMemo, useRef } from 'react'
import { useAuth } from './useAuth.js'

export interface AccountProfile {
  id: string
  username?: string | null
  name?: string | null
  avatar?: string | null
  primaryEmail?: string | null
  primaryPhone?: string | null
  identities?: Record<string, unknown>
  profile?: Record<string, unknown>
  customData?: Record<string, unknown>
}

export interface AccountSession {
  id: string
  applicationId?: string
  createdAt?: string
  updatedAt?: string
  lastSignInAt?: string
  device?: Record<string, unknown>
}

export interface AccountGrant {
  id: string
  applicationId?: string
  applicationName?: string
  applicationType?: string
  createdAt?: string
}

export interface MfaVerification {
  id: string
  type: string
  name?: string
  agent?: string
  createdAt?: string
  updatedAt?: string
}

export class AccountApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message)
    this.name = 'AccountApiError'
  }
}

export interface AccountManagementAdapter {
  deleteAccount(input: { accessToken: string; confirmation: string; idempotencyKey: string }): Promise<void>
}

export interface AccountClientOptions {
  endpoint?: string
  managementAdapter?: AccountManagementAdapter
}

export function createAccountClient(endpoint: string, getAccessToken: () => Promise<string>) {
  const base = endpoint.replace(/\/+$/, '')
  const request = async <T>(path: string, init: RequestInit = {}, verificationId?: string): Promise<T> => {
    const token = await getAccessToken()
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(verificationId ? { 'logto-verification-id': verificationId } : {}),
        ...init.headers,
      },
    })
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { message?: string; code?: string }
      throw new AccountApiError(body.message ?? `Account request failed with status ${response.status}.`, response.status, body.code)
    }
    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  }
  const json = (method: string, body?: unknown): RequestInit => ({
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

  return {
    getProfile: () => request<AccountProfile>('/api/my-account'),
    updateProfile: (profile: Partial<Pick<AccountProfile, 'username' | 'name' | 'avatar' | 'customData'>>) =>
      request<AccountProfile>('/api/my-account', json('PATCH', profile)),
    updateStandardProfile: (profile: Record<string, unknown>) =>
      request<Record<string, unknown>>('/api/my-account/profile', json('PATCH', profile)),
    verifyPassword: (password: string) =>
      request<{ verificationRecordId: string; expiresAt: string }>('/api/verifications/password', json('POST', { password })),
    requestVerificationCode: (identifier: { type: 'email' | 'phone'; value: string }) =>
      request<{ verificationRecordId?: string; verificationId?: string; expiresAt: string }>(
        '/api/verifications/verification-code',
        json('POST', { identifier }),
      ),
    verifyCode: (identifier: { type: 'email' | 'phone'; value: string }, verificationId: string, code: string) =>
      request<{ verificationRecordId: string }>(
        '/api/verifications/verification-code/verify',
        json('POST', { identifier, verificationId, code }),
      ),
    updatePassword: (password: string, verificationId: string) =>
      request<void>('/api/my-account/password', json('POST', { password }), verificationId),
    updatePrimaryEmail: (email: string, newIdentifierVerificationRecordId: string, verificationId: string) =>
      request<void>('/api/my-account/primary-email', json('POST', { email, newIdentifierVerificationRecordId }), verificationId),
    removePrimaryEmail: (verificationId: string) =>
      request<void>('/api/my-account/primary-email', { method: 'DELETE' }, verificationId),
    updatePrimaryPhone: (phone: string, newIdentifierVerificationRecordId: string, verificationId: string) =>
      request<void>('/api/my-account/primary-phone', json('PATCH', { phone, newIdentifierVerificationRecordId }), verificationId),
    removePrimaryPhone: (verificationId: string) =>
      request<void>('/api/my-account/primary-phone', { method: 'DELETE' }, verificationId),
    beginSocialLink: (connectorId: string, redirectUri: string, state: string) =>
      request<{ authorizationUri: string; verificationRecordId: string }>(
        '/api/verifications/social',
        json('POST', { connectorId, redirectUri, state }),
      ),
    verifySocialLink: (connectorData: Record<string, string>, verificationRecordId: string) =>
      request<{ verificationRecordId: string }>(
        '/api/verifications/social/verify',
        json('POST', { connectorData, verificationRecordId }),
      ),
    linkSocialIdentity: (newIdentifierVerificationRecordId: string, verificationId: string) =>
      request<void>('/api/my-account/identities', json('POST', { newIdentifierVerificationRecordId }), verificationId),
    removeSocialIdentity: (target: string, verificationId: string) =>
      request<void>(`/api/my-account/identities/${encodeURIComponent(target)}`, { method: 'DELETE' }, verificationId),
    listMfa: () => request<MfaVerification[]>('/api/my-account/mfa-verifications'),
    generateTotpSecret: () => request<{ secret: string }>('/api/my-account/mfa-verifications/totp-secret/generate', { method: 'POST' }),
    bindTotp: (secret: string, verificationId: string) =>
      request<void>('/api/my-account/mfa-verifications', json('POST', { type: 'Totp', secret }), verificationId),
    generateBackupCodes: () =>
      request<{ codes: string[] }>('/api/my-account/mfa-verifications/backup-codes/generate', { method: 'POST' }),
    bindBackupCodes: (codes: string[], verificationId: string) =>
      request<void>('/api/my-account/mfa-verifications', json('POST', { type: 'BackupCode', codes }), verificationId),
    listBackupCodes: () => request<{ codes: Array<{ code: string; usedAt: string | null }> }>('/api/my-account/mfa-verifications/backup-codes'),
    deleteMfa: (factorId: string, verificationId: string) =>
      request<void>(`/api/my-account/mfa-verifications/${encodeURIComponent(factorId)}`, { method: 'DELETE' }, verificationId),
    beginPasskeyRegistration: () =>
      request<{ registrationOptions: unknown; verificationRecordId: string; expiresAt: string }>(
        '/api/verifications/web-authn/registration',
        { method: 'POST' },
      ),
    verifyPasskeyRegistration: (payload: unknown, verificationRecordId: string) =>
      request<{ verificationRecordId: string }>(
        '/api/verifications/web-authn/registration/verify',
        json('POST', { payload, verificationRecordId }),
      ),
    linkPasskey: (newIdentifierVerificationRecordId: string, verificationId: string) =>
      request<void>('/api/my-account/mfa-verifications', json('POST', { type: 'WebAuthn', newIdentifierVerificationRecordId }), verificationId),
    getMfaSettings: () => request<{ skipMfaOnSignIn: boolean }>('/api/my-account/mfa-settings'),
    updateMfaSettings: (skipMfaOnSignIn: boolean, verificationId: string) =>
      request<void>('/api/my-account/mfa-settings', json('PATCH', { skipMfaOnSignIn }), verificationId),
    listSessions: (verificationId: string) => request<AccountSession[]>('/api/my-account/sessions', {}, verificationId),
    revokeSession: (sessionId: string, verificationId: string) =>
      request<void>(`/api/my-account/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }, verificationId),
    listGrants: (verificationId: string) => request<AccountGrant[]>('/api/my-account/grants', {}, verificationId),
    revokeGrant: (grantId: string, verificationId: string) =>
      request<void>(`/api/my-account/grants/${encodeURIComponent(grantId)}`, { method: 'DELETE' }, verificationId),
  }
}

export type AccountClient = ReturnType<typeof createAccountClient> & { deleteAccount(confirmation: string): Promise<void> }

export function useAccountClient(options: AccountClientOptions = {}): AccountClient {
  const { endpoint: providerEndpoint, getAccountAccessToken, getApiAccessToken } = useAuth()
  const endpoint = options.endpoint ?? providerEndpoint
  const getAccountAccessTokenRef = useRef(getAccountAccessToken)
  const getApiAccessTokenRef = useRef(getApiAccessToken)
  const managementAdapterRef = useRef(options.managementAdapter)
  getAccountAccessTokenRef.current = getAccountAccessToken
  getApiAccessTokenRef.current = getApiAccessToken
  managementAdapterRef.current = options.managementAdapter

  return useMemo(
    () => ({
      ...createAccountClient(endpoint, () => getAccountAccessTokenRef.current()),
      async deleteAccount(confirmation: string) {
        const managementAdapter = managementAdapterRef.current
        if (!managementAdapter) {
          throw new Error('Account deletion requires an AccountManagementAdapter backed by a trusted server.')
        }
        await managementAdapter.deleteAccount({
          accessToken: await getApiAccessTokenRef.current(),
          confirmation,
          idempotencyKey: crypto.randomUUID(),
        })
      },
    }),
    [endpoint],
  )
}

export function useAccountRequest<T>(operation: (client: AccountClient) => Promise<T>, options?: AccountClientOptions) {
  const client = useAccountClient(options)
  return useCallback(() => operation(client), [client, operation])
}
