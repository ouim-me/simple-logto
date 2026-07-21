'use client'

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { AccountClient, AccountClientOptions, AccountGrant, AccountProfile as AccountProfileData, AccountSession, MfaVerification } from './account.js'
import { useAccountClient } from './account.js'

type Feedback = (message: string) => void

export interface AccountCenterProps {
  client?: AccountClient
  clientOptions?: AccountClientOptions
  className?: string
  defaultSection?: 'profile' | 'security' | 'sessions' | 'applications'
  onError?: Feedback
  onSuccess?: Feedback
  sections?: Array<'profile' | 'security' | 'sessions' | 'applications'>
}

const messageOf = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback)

export function AccountCenter({
  client: suppliedClient,
  clientOptions,
  className = '',
  defaultSection = 'profile',
  onError,
  onSuccess,
  sections = ['profile', 'security', 'sessions', 'applications'],
}: AccountCenterProps) {
  if (suppliedClient) {
    return <AccountCenterView client={suppliedClient} className={className} defaultSection={defaultSection} onError={onError} onSuccess={onSuccess} sections={sections} />
  }
  return <ConnectedAccountCenter clientOptions={clientOptions} className={className} defaultSection={defaultSection} onError={onError} onSuccess={onSuccess} sections={sections} />
}

function ConnectedAccountCenter(props: Omit<AccountCenterProps, 'client'>) {
  const client = useAccountClient(props.clientOptions)
  return <AccountCenterView {...props} client={client} />
}

function AccountCenterView({
  client,
  className = '',
  defaultSection = 'profile',
  onError,
  onSuccess,
  sections = ['profile', 'security', 'sessions', 'applications'],
}: Omit<AccountCenterProps, 'client' | 'clientOptions'> & { client: AccountClient }) {
  const [section, setSection] = useState(defaultSection)
  const [verificationId, setVerificationId] = useState<string>()

  return (
    <section className={`logto-authkit-account-center ${className}`.trim()}>
      <nav className="logto-authkit-account-nav" aria-label="Account settings">
        {sections.map((item) => (
          <button key={item} type="button" aria-current={section === item ? 'page' : undefined} onClick={() => setSection(item)}>
            {item === 'applications' ? 'Apps' : item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </nav>
      <div className="logto-authkit-account-panel">
        {section === 'profile' ? <AccountProfilePanel client={client} onError={onError} onSuccess={onSuccess} /> : null}
        {section === 'security' ? <AccountSecurity client={client} verificationId={verificationId} onVerification={setVerificationId} onError={onError} onSuccess={onSuccess} /> : null}
        {section === 'sessions' ? <AccountSessions client={client} verificationId={verificationId} locked={<AccountUnlock client={client} onVerification={setVerificationId} onError={onError} />} onError={onError} onSuccess={onSuccess} /> : null}
        {section === 'applications' ? <AccountApplications client={client} verificationId={verificationId} locked={<AccountUnlock client={client} onVerification={setVerificationId} onError={onError} />} onError={onError} onSuccess={onSuccess} /> : null}
      </div>
    </section>
  )
}

interface AccountSectionProps {
  client: AccountClient
  onError?: Feedback
  onSuccess?: Feedback
}

export function AccountProfilePanel({ client, onError, onSuccess }: AccountSectionProps) {
  const [profile, setProfile] = useState<AccountProfileData>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      setProfile(await client.getProfile())
    } catch (error) {
      onError?.(messageOf(error, 'Your profile could not be loaded.'))
    } finally {
      setLoading(false)
    }
  }, [client, onError])
  useEffect(() => void load(), [load])

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!profile) return
    setSaving(true)
    try {
      const updated = await client.updateProfile({ username: profile.username, name: profile.name, avatar: profile.avatar })
      setProfile(updated)
      onSuccess?.('Profile saved.')
    } catch (error) {
      onError?.(messageOf(error, 'Profile changes could not be saved.'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <AccountStatus>Loading profile…</AccountStatus>
  if (!profile) return <AccountStatus><button type="button" onClick={() => void load()}>Try again</button></AccountStatus>
  return (
    <form className="logto-authkit-account-form" onSubmit={save}>
      <AccountHeading title="Profile" description="Manage the identity details shared with this application." />
      <div className="logto-authkit-account-profile-preview">
        {profile.avatar ? <img src={profile.avatar} alt="" /> : <span>{(profile.name ?? profile.username ?? 'U').slice(0, 1).toUpperCase()}</span>}
        <div><strong>{profile.name ?? 'Signed-in user'}</strong><small>{profile.primaryEmail ?? profile.username ?? profile.id}</small></div>
      </div>
      <AccountField label="Display name"><input value={profile.name ?? ''} onChange={(event) => setProfile({ ...profile, name: event.target.value })} autoComplete="name" /></AccountField>
      <AccountField label="Username"><input value={profile.username ?? ''} onChange={(event) => setProfile({ ...profile, username: event.target.value })} autoComplete="username" /></AccountField>
      <AccountField label="Avatar URL"><input value={profile.avatar ?? ''} onChange={(event) => setProfile({ ...profile, avatar: event.target.value })} inputMode="url" /></AccountField>
      <button className="logto-authkit-account-action" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
    </form>
  )
}

interface AccountUnlockProps extends Pick<AccountSectionProps, 'client' | 'onError'> {
  onVerification(id: string): void
}

export function AccountUnlock({ client, onVerification, onError }: AccountUnlockProps) {
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setPending(true)
    try {
      const result = await client.verifyPassword(password)
      setPassword('')
      onVerification(result.verificationRecordId)
    } catch (error) {
      onError?.(messageOf(error, 'Your password could not be verified.'))
    } finally {
      setPending(false)
    }
  }
  return (
    <form className="logto-authkit-account-form" onSubmit={submit}>
      <AccountHeading title="Confirm it’s you" description="Sensitive settings require a recent verification." />
      <AccountField label="Current password"><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></AccountField>
      <button className="logto-authkit-account-action" disabled={pending}>{pending ? 'Verifying…' : 'Unlock settings'}</button>
    </form>
  )
}

interface AccountSecurityProps extends AccountSectionProps {
  verificationId?: string
  onVerification(id: string): void
}

export function AccountSecurity({ client, verificationId, onVerification, onError, onSuccess }: AccountSecurityProps) {
  const [mfa, setMfa] = useState<MfaVerification[]>([])
  const [newPassword, setNewPassword] = useState('')
  const [totpSecret, setTotpSecret] = useState<string>()
  const loadMfa = useCallback(async () => {
    try { setMfa(await client.listMfa()) } catch (error) { onError?.(messageOf(error, 'Security methods could not be loaded.')) }
  }, [client, onError])
  useEffect(() => { if (verificationId) void loadMfa() }, [loadMfa, verificationId])
  if (!verificationId) return <AccountUnlock client={client} onVerification={onVerification} onError={onError} />

  const changePassword = async (event: FormEvent) => {
    event.preventDefault()
    try {
      await client.updatePassword(newPassword, verificationId)
      setNewPassword('')
      onSuccess?.('Password changed.')
    } catch (error) { onError?.(messageOf(error, 'Password could not be changed.')) }
  }
  const beginTotp = async () => {
    try { setTotpSecret((await client.generateTotpSecret()).secret) } catch (error) { onError?.(messageOf(error, 'An authenticator secret could not be created.')) }
  }
  const bindTotp = async () => {
    if (!totpSecret) return
    try {
      await client.bindTotp(totpSecret, verificationId)
      setTotpSecret(undefined)
      await loadMfa()
      onSuccess?.('Authenticator connected.')
    } catch (error) { onError?.(messageOf(error, 'The authenticator could not be connected.')) }
  }
  return (
    <div className="logto-authkit-account-stack">
      <AccountHeading title="Security" description="Manage passwords and multi-factor authentication." />
      <div className="logto-authkit-account-list">
        {mfa.map((factor) => <AccountRow key={factor.id} title={factor.name ?? factor.type} detail={factor.agent ?? 'Multi-factor method'} action={<button type="button" onClick={() => void client.deleteMfa(factor.id, verificationId).then(loadMfa).catch((error) => onError?.(messageOf(error, 'That method could not be removed.')))}>Remove</button>} />)}
        {!mfa.length ? <AccountStatus>No multi-factor method is connected.</AccountStatus> : null}
      </div>
      {!totpSecret ? <button className="logto-authkit-account-secondary" type="button" onClick={() => void beginTotp()}>Add authenticator</button> : <div className="logto-authkit-account-secret"><small>Authenticator secret</small><code>{totpSecret}</code><button type="button" onClick={() => void bindTotp()}>I saved this secret</button></div>}
      <form className="logto-authkit-account-form" onSubmit={changePassword}>
        <AccountField label="New password"><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" required /></AccountField>
        <button className="logto-authkit-account-action">Change password</button>
      </form>
    </div>
  )
}

interface VerifiedSectionProps extends AccountSectionProps {
  verificationId?: string
  locked?: ReactNode
}

export function AccountSessions({ client, verificationId, locked, onError, onSuccess }: VerifiedSectionProps) {
  const [sessions, setSessions] = useState<AccountSession[]>([])
  const [loading, setLoading] = useState(Boolean(verificationId))
  useEffect(() => {
    if (!verificationId) return
    setLoading(true)
    void client.listSessions(verificationId).then(setSessions).catch((error) => onError?.(messageOf(error, 'Sessions could not be loaded.'))).finally(() => setLoading(false))
  }, [client, onError, verificationId])
  if (!verificationId) return <>{locked ?? <AccountStatus>Verify your identity to view sessions.</AccountStatus>}</>
  if (loading) return <AccountStatus>Loading sessions…</AccountStatus>
  return <div className="logto-authkit-account-stack"><AccountHeading title="Sessions" description="Review and revoke active application sessions." /><div className="logto-authkit-account-list">{sessions.map((session) => <AccountRow key={session.id} title={session.applicationId ?? 'Active session'} detail={session.lastSignInAt ?? session.updatedAt ?? 'Active'} action={<button type="button" onClick={() => void client.revokeSession(session.id, verificationId).then(() => { setSessions((current) => current.filter((item) => item.id !== session.id)); onSuccess?.('Session revoked.') }).catch((error) => onError?.(messageOf(error, 'That session could not be revoked.')))}>Revoke</button>} />)}{!sessions.length ? <AccountStatus>No active sessions were returned.</AccountStatus> : null}</div></div>
}

export function AccountApplications({ client, verificationId, locked, onError, onSuccess }: VerifiedSectionProps) {
  const [grants, setGrants] = useState<AccountGrant[]>([])
  const [loading, setLoading] = useState(Boolean(verificationId))
  useEffect(() => {
    if (!verificationId) return
    setLoading(true)
    void client.listGrants(verificationId).then(setGrants).catch((error) => onError?.(messageOf(error, 'Authorized applications could not be loaded.'))).finally(() => setLoading(false))
  }, [client, onError, verificationId])
  if (!verificationId) return <>{locked ?? <AccountStatus>Verify your identity to view authorized applications.</AccountStatus>}</>
  if (loading) return <AccountStatus>Loading applications…</AccountStatus>
  return <div className="logto-authkit-account-stack"><AccountHeading title="Authorized applications" description="Review which applications can use your identity." /><div className="logto-authkit-account-list">{grants.map((grant) => <AccountRow key={grant.id} title={grant.applicationName ?? grant.applicationId ?? 'Authorized application'} detail={grant.applicationType ?? 'Application access'} action={<button type="button" onClick={() => void client.revokeGrant(grant.id, verificationId).then(() => { setGrants((current) => current.filter((item) => item.id !== grant.id)); onSuccess?.('Application access revoked.') }).catch((error) => onError?.(messageOf(error, 'Application access could not be revoked.')))}>Revoke</button>} />)}{!grants.length ? <AccountStatus>No active application grants were returned.</AccountStatus> : null}</div></div>
}

function AccountHeading({ title, description }: { title: string; description: string }) {
  return <header className="logto-authkit-account-heading"><h2>{title}</h2><p>{description}</p></header>
}

function AccountField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="logto-authkit-account-field"><span>{label}</span>{children}</label>
}

function AccountStatus({ children }: { children: ReactNode }) {
  return <div className="logto-authkit-account-status">{children}</div>
}

function AccountRow({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <div className="logto-authkit-account-row"><div><strong>{title}</strong><small>{detail}</small></div>{action}</div>
}
