import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SignInPage } from './signin'
import { useAuth } from './useAuth'

vi.mock('./useAuth', () => ({
  useAuth: vi.fn(),
}))

describe('SignInPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    localStorage.clear()
    Object.defineProperty(window, 'location', {
      value: {
        href: 'https://test.example.com/signin',
        pathname: '/signin',
        search: '',
        origin: 'https://test.example.com',
        reload: vi.fn(),
      },
      writable: true,
      configurable: true,
    })
    Object.defineProperty(window, 'opener', {
      value: null,
      writable: true,
      configurable: true,
    })
  })

  it('renders a custom loading component and className while auth state is loading', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoadingUser: true,
      signOut: vi.fn(),
      refreshAuth: vi.fn(),
      signIn: vi.fn(),
    })

    const { container } = render(<SignInPage className="signin-shell" loadingComponent={<div>Loading auth...</div>} />)

    expect(screen.getByText('Loading auth...')).toBeInTheDocument()
    expect(container.firstChild).toHaveClass('signin-shell')
  })

  it('renders the default error UI when initiating sign-in fails', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoadingUser: false,
      signOut: vi.fn(),
      refreshAuth: vi.fn(),
      signIn: vi.fn().mockRejectedValue(new Error('Popup blocked')),
    })

    render(<SignInPage />)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to start sign-in. Please try again.')
    })
  })

  it('renders a custom error component callback with the thrown error', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoadingUser: false,
      signOut: vi.fn(),
      refreshAuth: vi.fn(),
      signIn: vi.fn().mockRejectedValue(new Error('Network offline')),
    })

    render(<SignInPage errorComponent={error => <div role="alert">Custom: {error.message}</div>} className="custom-error" />)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Custom: Network offline')
    })
    expect(screen.getByRole('alert').parentElement).toHaveClass('custom-error')
  })

  it('redirects authenticated users to / in redirect flow', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-123', name: 'Test User' },
      isLoadingUser: false,
      signOut: vi.fn(),
      refreshAuth: vi.fn(),
      signIn: vi.fn(),
    })

    render(<SignInPage />)

    await waitFor(() => {
      expect(window.location.href).toBe('/')
    })
  })
})
