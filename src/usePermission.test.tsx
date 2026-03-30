import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { usePermission } from './usePermission'
import { useAuthContext } from './context'

vi.mock('./context', async () => {
  const actual = await vi.importActual('./context')
  return {
    ...actual,
    useAuthContext: vi.fn(),
  }
})

describe('usePermission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns true when the user has the requested permission in the permissions claim', () => {
    vi.mocked(useAuthContext).mockReturnValue({
      user: {
        id: 'user-123',
        permissions: ['read:reports', 'manage:users'],
      },
      isLoadingUser: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
      refreshAuth: vi.fn(),
      enablePopupSignIn: false,
    })

    const TestComponent = () => <div>{usePermission('manage:users') ? 'allowed' : 'denied'}</div>
    render(<TestComponent />)
    expect(screen.getByText('allowed')).toBeInTheDocument()
  })

  it('supports whitespace-delimited scope claims by default', () => {
    vi.mocked(useAuthContext).mockReturnValue({
      user: {
        id: 'user-123',
        scope: 'read:reports write:reports',
      },
      isLoadingUser: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
      refreshAuth: vi.fn(),
      enablePopupSignIn: false,
    })

    const TestComponent = () => <div>{usePermission('write:reports') ? 'allowed' : 'denied'}</div>
    render(<TestComponent />)
    expect(screen.getByText('allowed')).toBeInTheDocument()
  })

  it('supports any mode for multi-permission checks', () => {
    vi.mocked(useAuthContext).mockReturnValue({
      user: {
        id: 'user-123',
        permissions: ['dashboard:read'],
      },
      isLoadingUser: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
      refreshAuth: vi.fn(),
      enablePopupSignIn: false,
    })

    const TestComponent = () => (
      <div>{usePermission(['billing:read', 'dashboard:read'], { mode: 'any' }) ? 'allowed' : 'denied'}</div>
    )

    render(<TestComponent />)
    expect(screen.getByText('allowed')).toBeInTheDocument()
  })

  it('supports custom claim keys', () => {
    vi.mocked(useAuthContext).mockReturnValue({
      user: {
        id: 'user-123',
        'https://example.com/permissions': ['billing:read'],
      },
      isLoadingUser: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
      refreshAuth: vi.fn(),
      enablePopupSignIn: false,
    })

    const TestComponent = () => (
      <div>
        {usePermission('billing:read', { claimKeys: ['https://example.com/permissions'] }) ? 'allowed' : 'denied'}
      </div>
    )

    render(<TestComponent />)
    expect(screen.getByText('allowed')).toBeInTheDocument()
  })

  it('returns false while auth state is still loading', () => {
    vi.mocked(useAuthContext).mockReturnValue({
      user: {
        id: 'user-123',
        permissions: ['manage:users'],
      },
      isLoadingUser: true,
      signIn: vi.fn(),
      signOut: vi.fn(),
      refreshAuth: vi.fn(),
      enablePopupSignIn: false,
    })

    const TestComponent = () => <div>{usePermission('manage:users') ? 'allowed' : 'denied'}</div>
    render(<TestComponent />)
    expect(screen.getByText('denied')).toBeInTheDocument()
  })

  it('returns false when the permission is missing', () => {
    vi.mocked(useAuthContext).mockReturnValue({
      user: {
        id: 'user-123',
        permissions: ['dashboard:read'],
      },
      isLoadingUser: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
      refreshAuth: vi.fn(),
      enablePopupSignIn: false,
    })

    const TestComponent = () => <div>{usePermission('manage:users') ? 'allowed' : 'denied'}</div>
    render(<TestComponent />)
    expect(screen.getByText('denied')).toBeInTheDocument()
  })
})
