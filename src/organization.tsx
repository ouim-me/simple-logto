'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Building2, Check, ChevronsUpDown } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from './useAuth.js'

export interface Organization {
  id: string
  name: string
  description?: string | null
  logo?: string | null
  customData?: Record<string, unknown>
  isMfaRequired?: boolean
}

export interface OrganizationMember {
  id: string
  name?: string | null
  avatar?: string | null
  primaryEmail?: string | null
  organizationRoles?: Array<{ id: string; name: string }>
}

export interface OrganizationInvitation {
  id: string
  invitee: string
  status: string
  organizationId: string
  createdAt?: number
  expiresAt?: number
}

export interface OrganizationRole {
  id: string
  name: string
  description?: string | null
  type?: 'User' | 'MachineToMachine'
}

export interface OrganizationClient {
  list(): Promise<Organization[]>
  create(value: Pick<Organization, 'name' | 'description'>, idempotencyKey?: string): Promise<Organization>
  update(id: string, value: Partial<Pick<Organization, 'name' | 'description' | 'logo' | 'customData'>>): Promise<Organization>
  members(id: string): Promise<OrganizationMember[]>
  roles(id: string): Promise<OrganizationRole[]>
  replaceMemberRoles(id: string, userId: string, organizationRoleIds: string[]): Promise<void>
  removeMember(id: string, userId: string): Promise<void>
  invitations(id: string): Promise<OrganizationInvitation[]>
  invite(id: string, email: string, organizationRoleIds?: string[], idempotencyKey?: string): Promise<OrganizationInvitation>
  revokeInvitation(id: string, invitationId: string): Promise<void>
  resendInvitation(id: string, invitationId: string, link: string, idempotencyKey?: string): Promise<void>
}

/** Creates a client for any backend implementing AuthKit's organization HTTP contract. */
export function createOrganizationClient(baseUrl: string, getToken: (organizationId?: string) => Promise<string>): OrganizationClient {
  const base = baseUrl.replace(/\/+$/, '')
  async function request<T>(path: string, init: RequestInit = {}, organizationId?: string): Promise<T> {
    const token = await getToken(organizationId)
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
    })
    const body = (await response.json().catch(() => ({}))) as { data?: T; message?: string }
    if (!response.ok) throw new Error(body.message ?? `Organization request failed with status ${response.status}.`)
    return body.data as T
  }
  const json = (method: string, value: unknown, idempotencyKey?: string): RequestInit => ({
    method,
    body: JSON.stringify(value),
    headers: { 'idempotency-key': idempotencyKey ?? crypto.randomUUID() },
  })
  return {
    list: () => request<Organization[]>('/organizations'),
    create: (value, idempotencyKey) => request<Organization>('/organizations', json('POST', value, idempotencyKey)),
    update: (id, value) => request<Organization>(`/organizations/${encodeURIComponent(id)}`, json('PATCH', value), id),
    members: (id) => request<OrganizationMember[]>(`/organizations/${encodeURIComponent(id)}/members`, {}, id),
    roles: (id) => request<OrganizationRole[]>(`/organizations/${encodeURIComponent(id)}/roles`, {}, id),
    replaceMemberRoles: (id, userId, organizationRoleIds) =>
      request<void>(
        `/organizations/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}/roles`,
        { method: 'PUT', body: JSON.stringify({ organizationRoleIds }) },
        id,
      ),
    removeMember: (id, userId) =>
      request<void>(`/organizations/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' }, id),
    invitations: (id) => request<OrganizationInvitation[]>(`/organizations/${encodeURIComponent(id)}/invitations`, {}, id),
    invite: (id, email, organizationRoleIds = [], idempotencyKey) =>
      request<OrganizationInvitation>(
        `/organizations/${encodeURIComponent(id)}/invitations`,
        json('POST', { email, organizationRoleIds }, idempotencyKey),
        id,
      ),
    revokeInvitation: (id, invitationId) =>
      request<void>(`/organizations/${encodeURIComponent(id)}/invitations/${encodeURIComponent(invitationId)}`, { method: 'DELETE' }, id),
    resendInvitation: (id, invitationId, link, idempotencyKey) =>
      request<void>(
        `/organizations/${encodeURIComponent(id)}/invitations/${encodeURIComponent(invitationId)}/message`,
        json('POST', { link }, idempotencyKey),
        id,
      ),
  }
}

interface OrganizationValue {
  organizations: Organization[]
  activeOrganization: Organization | null
  isLoaded: boolean
  error: Error | null
  setActiveOrganization(id: string): void
  refresh(): Promise<void>
  client: OrganizationClient
}

const OrganizationContext = createContext<OrganizationValue | null>(null)

export interface OrganizationProviderProps {
  children: ReactNode
  /** A custom adapter is preferred when the backend does not use the default HTTP contract. */
  client?: OrganizationClient
  /** Base URL for the default HTTP adapter. Required when client is omitted. */
  endpoint?: string
  storageKey?: string
}

export function OrganizationProvider({ children, client: suppliedClient, endpoint, storageKey = 'logto-authkit:active-organization' }: OrganizationProviderProps) {
  const { getApiAccessToken, getOrganizationAccessToken } = useAuth()
  const getApiAccessTokenRef = useRef(getApiAccessToken)
  const getOrganizationAccessTokenRef = useRef(getOrganizationAccessToken)
  getApiAccessTokenRef.current = getApiAccessToken
  getOrganizationAccessTokenRef.current = getOrganizationAccessToken
  const client = useMemo(() => {
    if (suppliedClient) return suppliedClient
    if (!endpoint) throw new Error('OrganizationProvider requires either a client or endpoint.')
    return createOrganizationClient(endpoint, (organizationId) =>
      organizationId ? getOrganizationAccessTokenRef.current(organizationId) : getApiAccessTokenRef.current(),
    )
  }, [endpoint, suppliedClient])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [activeId, setActiveId] = useState(() =>
    typeof window === 'undefined' ? '' : (window.localStorage.getItem(storageKey) ?? ''),
  )
  const [isLoaded, setLoaded] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const refresh = useCallback(async () => {
    try {
      const list = await client.list()
      setOrganizations(list)
      setActiveId((current) => (list.some((item) => item.id === current) ? current : (list[0]?.id ?? '')))
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error(String(caught)))
    } finally {
      setLoaded(true)
    }
  }, [client])
  useEffect(() => void refresh(), [refresh])
  const setActiveOrganization = useCallback(
    (id: string) => {
      setActiveId(id)
      window.localStorage.setItem(storageKey, id)
    },
    [storageKey],
  )
  const value = useMemo<OrganizationValue>(
    () => ({
      organizations,
      activeOrganization: organizations.find((item) => item.id === activeId) ?? null,
      isLoaded,
      error,
      setActiveOrganization,
      refresh,
      client,
    }),
    [activeId, client, error, isLoaded, organizations, refresh, setActiveOrganization],
  )
  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>
}

export const useOrganizationList = () => {
  const value = useContext(OrganizationContext)
  if (!value) throw new Error('Organization primitives must be rendered inside OrganizationProvider.')
  return value
}

export const useOrganization = () => {
  const { activeOrganization, isLoaded, client } = useOrganizationList()
  return { organization: activeOrganization, isLoaded, client }
}

export function OrganizationSwitcher({ className }: { className?: string }) {
  const { organizations, activeOrganization, setActiveOrganization } = useOrganizationList()
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={`logto-authkit-org-switcher ${className ?? ''}`}>
        <span>{activeOrganization?.logo ? <img src={activeOrganization.logo} alt="" /> : <Building2 />}</span>
        <strong>{activeOrganization?.name ?? 'Choose organization'}</strong>
        <ChevronsUpDown />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="logto-authkit-menu" align="start" sideOffset={8}>
          {organizations.map((organization) => (
            <DropdownMenu.Item key={organization.id} className="logto-authkit-menu-item" onSelect={() => setActiveOrganization(organization.id)}>
              <Building2 />
              {organization.name}
              {organization.id === activeOrganization?.id ? <Check /> : null}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export function OrganizationProfile() {
  const { organization } = useOrganization()
  if (!organization) return null
  return (
    <div className="logto-authkit-org-profile">
      {organization.logo ? <img src={organization.logo} alt="" /> : <Building2 />}
      <div><strong>{organization.name}</strong>{organization.description ? <span>{organization.description}</span> : null}</div>
    </div>
  )
}
