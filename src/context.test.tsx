import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { ReactNode } from 'react'
import { AuthProvider } from './context'
import { useAuthContext } from './context'
import { useAuth } from './useAuth'
import { useNavigation } from './navigation'
import { useLogto, type LogtoConfig } from '@logto/react'
import { jwtCookieUtils } from './utils'

// Mock @logto/react
vi.mock('@logto/react', () => ({
  LogtoProvider: ({ children }: { children: ReactNode }) => children,
  useLogto: vi.fn(),
}))

// Mock utils
vi.mock('./utils', () => ({
  transformUser: (claims: any) => ({
    id: claims.sub,
    name: claims.name,
    email: claims.email,
  }),
  jwtCookieUtils: {
    saveToken: vi.fn(),
    removeToken: vi.fn(),
    getToken: vi.fn(),
  },
  guestUtils: {
    ensureGuestId: vi.fn(),
  },
  validateLogtoConfig: vi.fn(),
  navigateTo: vi.fn(),
}))

const mockConfig: LogtoConfig = {
  endpoint: 'https://test.logto.app',
  appId: 'test-app-id',
}

const createMockLogtoContext = (overrides: Partial<ReturnType<typeof useLogto>> = {}) => ({
  isAuthenticated: false,
  isLoading: false,
  getIdTokenClaims: vi.fn().mockResolvedValue({
    sub: 'user-123',
    name: 'Test User',
    email: 'test@example.com',
  }),
  getAccessToken: vi.fn().mockResolvedValue('mock-token'),
  signIn: vi.fn(),
  signOut: vi.fn(),
  ...overrides,
})

const createMockJwt = (exp: number) => {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ exp })}.signature`
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useLogto).mockReturnValue(createMockLogtoContext())
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('AuthProvider Context', () => {
  it('should render children', () => {
    render(
      <AuthProvider config={mockConfig}>
        <div>Test Child</div>
      </AuthProvider>,
    )
    expect(screen.getByText('Test Child')).toBeInTheDocument()
  })

  it('should provide access to auth context', async () => {
    const TestComponent = () => {
      const auth = useAuthContext()
      return (
        <div>
          <div>isLoadingUser: {auth.isLoadingUser ? 'true' : 'false'}</div>
          <div>user: {auth.user ? auth.user.id : 'null'}</div>
        </div>
      )
    }

    render(
      <AuthProvider config={mockConfig}>
        <TestComponent />
      </AuthProvider>,
    )

    // Initially loading should be true
    await waitFor(() => {
      expect(screen.getByText(/isLoadingUser:/)).toBeInTheDocument()
    })
  })

  it('should initialize with unauthenticated state when user is not logged in', async () => {
    const TestComponent = () => {
      const auth = useAuthContext()
      return (
        <div>
          <div>user: {auth.user ? 'logged in' : 'not logged in'}</div>
        </div>
      )
    }

    render(
      <AuthProvider config={mockConfig}>
        <TestComponent />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText(/not logged in/)).toBeInTheDocument()
    })
  })

  it('should provide signIn and signOut methods', async () => {
    const TestComponent = () => {
      const auth = useAuthContext()
      return (
        <div>
          <button onClick={() => auth.signIn()}>Sign In</button>
          <button onClick={() => auth.signOut()}>Sign Out</button>
        </div>
      )
    }

    render(
      <AuthProvider config={mockConfig}>
        <TestComponent />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Sign In')).toBeInTheDocument()
      expect(screen.getByText('Sign Out')).toBeInTheDocument()
    })
  })

  it('should apply custom navigation if provided', async () => {
    const customNavigate = vi.fn()
    const TestComponent = () => {
      const navigate = useNavigation()

      return <button onClick={() => navigate('/settings')}>Navigate</button>
    }

    render(
      <AuthProvider config={mockConfig} customNavigate={customNavigate}>
        <TestComponent />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Navigate')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Navigate'))
    expect(customNavigate).toHaveBeenCalledWith('/settings', undefined)
  })

  it('should return context data with correct initial state', async () => {
    const TestComponent = () => {
      const { user, isLoadingUser, enablePopupSignIn } = useAuthContext()
      return (
        <div>
          <div>loading: {isLoadingUser.toString()}</div>
          <div>user-id: {user?.id || 'none'}</div>
          <div>popup: {enablePopupSignIn ? 'enabled' : 'disabled'}</div>
        </div>
      )
    }

    render(
      <AuthProvider config={mockConfig} enablePopupSignIn={true}>
        <TestComponent />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText(/popup: enabled/)).toBeInTheDocument()
    })
  })

  it('should handle callbackUrl prop', async () => {
    render(
      <AuthProvider config={mockConfig} callbackUrl="/auth/callback">
        <div>Test</div>
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Test')).toBeInTheDocument()
    })
  })

  it('should scope navigation to the nearest AuthProvider', async () => {
    const outerNavigate = vi.fn()
    const innerNavigate = vi.fn()

    const NavigationButton = ({ label }: { label: string }) => {
      const navigate = useNavigation()

      return <button onClick={() => navigate(`/${label.toLowerCase()}`)}>{label}</button>
    }

    render(
      <AuthProvider config={mockConfig} customNavigate={outerNavigate}>
        <NavigationButton label="Outer" />
        <AuthProvider config={mockConfig} customNavigate={innerNavigate}>
          <NavigationButton label="Inner" />
        </AuthProvider>
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Outer')).toBeInTheDocument()
      expect(screen.getByText('Inner')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Outer'))
    fireEvent.click(screen.getByText('Inner'))

    expect(outerNavigate).toHaveBeenCalledWith('/outer', undefined)
    expect(innerNavigate).toHaveBeenCalledWith('/inner', undefined)
    expect(outerNavigate).toHaveBeenCalledTimes(1)
    expect(innerNavigate).toHaveBeenCalledTimes(1)
  })

  it('should keep auth middleware redirects stable when customNavigate is passed inline', async () => {
    const navigateSpy = vi.fn()

    const ProtectedRoute = () => {
      useAuth({ middleware: 'auth', redirectTo: '/signin' })

      return <div>Protected</div>
    }

    const TestShell = ({ renderKey }: { renderKey: number }) => (
      <AuthProvider config={mockConfig} customNavigate={(url, options) => navigateSpy(url, options, renderKey)}>
        <ProtectedRoute />
      </AuthProvider>
    )

    const { rerender } = render(<TestShell renderKey={1} />)

    await waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledTimes(1)
    })

    rerender(<TestShell renderKey={2} />)

    expect(navigateSpy).toHaveBeenCalledTimes(1)
    expect(navigateSpy).toHaveBeenCalledWith('/signin', undefined, 1)
  })
})

// ---------------------------------------------------------------------------
// Development-mode config warnings (task 6.7)
// ---------------------------------------------------------------------------

describe('Development Config Warnings', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('warns about missing appId in non-production builds', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(
      <AuthProvider config={{ endpoint: 'https://test.logto.app', appId: '' }}>
        <div>test</div>
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('appId'))
    })
    warnSpy.mockRestore()
  })

  it('warns about missing endpoint in non-production builds', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(
      <AuthProvider config={{ endpoint: '', appId: 'test-app' }}>
        <div>test</div>
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('endpoint'))
    })
    warnSpy.mockRestore()
  })

  it('warns about missing resources in non-production builds', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(
      <AuthProvider config={{ endpoint: 'https://test.logto.app', appId: 'test-app' }}>
        <div>test</div>
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('resources'))
    })
    warnSpy.mockRestore()
  })

  it('does not warn about missing resources when resources are provided', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(
      <AuthProvider config={{ endpoint: 'https://test.logto.app', appId: 'test-app', resources: ['https://api.example.com'] }}>
        <div>test</div>
      </AuthProvider>,
    )

    await waitFor(() => screen.getByText('test'))

    const resourceWarnCalls = warnSpy.mock.calls.filter(([msg]) => typeof msg === 'string' && msg.includes('resources'))
    expect(resourceWarnCalls).toHaveLength(0)
    warnSpy.mockRestore()
  })
})

describe('Proactive Token Refresh', () => {
  const AuthStateProbe = () => {
    const { user, isLoadingUser } = useAuthContext()

    return (
      <div>
        <div>loading: {isLoadingUser ? 'true' : 'false'}</div>
        <div>user: {user ? user.id : 'none'}</div>
      </div>
    )
  }

  it('refreshes based on the access token expiry, not the id token expiry', async () => {
    const initialAccessTokenExp = Math.floor(Date.now() / 1000) + 61
    const refreshedAccessTokenExp = Math.floor(Date.now() / 1000) + 300
    const getIdTokenClaims = vi
      .fn()
      .mockResolvedValueOnce({
        sub: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
      .mockResolvedValueOnce({
        sub: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    const getAccessToken = vi
      .fn()
      .mockResolvedValueOnce(createMockJwt(initialAccessTokenExp))
      .mockResolvedValueOnce(createMockJwt(refreshedAccessTokenExp))
    const signOut = vi.fn()

    vi.mocked(useLogto).mockReturnValue(
      createMockLogtoContext({
        isAuthenticated: true,
        getIdTokenClaims,
        getAccessToken,
        signOut,
      }),
    )

    render(
      <AuthProvider config={mockConfig}>
        <AuthStateProbe />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByText('user: user-123')).toBeInTheDocument())
    expect(getAccessToken).toHaveBeenCalledTimes(1)
    expect(jwtCookieUtils.saveToken).toHaveBeenLastCalledWith(createMockJwt(initialAccessTokenExp))

    await waitFor(() => expect(getAccessToken).toHaveBeenCalledTimes(2), { timeout: 3000 })
    expect(jwtCookieUtils.saveToken).toHaveBeenLastCalledWith(createMockJwt(refreshedAccessTokenExp))
    expect(signOut).not.toHaveBeenCalled()
  }, 10000)

  it('signs the user out when a scheduled refresh fails with an auth error', async () => {
    const initialExp = Math.floor(Date.now() / 1000) + 61
    const getIdTokenClaims = vi
      .fn()
      .mockResolvedValueOnce({
        sub: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        exp: initialExp,
      })
      .mockRejectedValueOnce(new Error('invalid_grant'))
    const getAccessToken = vi.fn().mockResolvedValueOnce(createMockJwt(initialExp))
    const signOut = vi.fn()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.mocked(useLogto).mockReturnValue(
      createMockLogtoContext({
        isAuthenticated: true,
        getIdTokenClaims,
        getAccessToken,
        signOut,
      }),
    )

    render(
      <AuthProvider config={mockConfig}>
        <AuthStateProbe />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByText('user: user-123')).toBeInTheDocument())

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1), { timeout: 3000 })
    expect(jwtCookieUtils.removeToken).toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('forcing logout:'), 'invalid_grant')

    warnSpy.mockRestore()
    errorSpy.mockRestore()
  }, 10000)

  it('falls back to logout when refresh returns no access token, indicating an expired refresh token', async () => {
    const initialExp = Math.floor(Date.now() / 1000) + 61
    const getIdTokenClaims = vi
      .fn()
      .mockResolvedValueOnce({
        sub: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        exp: initialExp,
      })
      .mockResolvedValueOnce({
        sub: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        exp: initialExp,
      })
    const getAccessToken = vi.fn().mockResolvedValueOnce(createMockJwt(initialExp)).mockResolvedValueOnce(null)
    const signOut = vi.fn()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    vi.mocked(useLogto).mockReturnValue(
      createMockLogtoContext({
        isAuthenticated: true,
        getIdTokenClaims,
        getAccessToken,
        signOut,
      }),
    )

    render(
      <AuthProvider config={mockConfig}>
        <AuthStateProbe />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByText('user: user-123')).toBeInTheDocument())

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1), { timeout: 3000 })
    expect(jwtCookieUtils.removeToken).toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('session likely expired'))

    warnSpy.mockRestore()
  }, 10000)

  it('does not enter a 1-second refresh loop when the refreshed token keeps the same exp', async () => {
    const stableExp = Math.floor(Date.now() / 1000) + 61
    const stableToken = createMockJwt(stableExp)
    const getIdTokenClaims = vi.fn().mockResolvedValue({
      sub: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
    const getAccessToken = vi.fn().mockResolvedValue(stableToken)

    vi.mocked(useLogto).mockReturnValue(
      createMockLogtoContext({
        isAuthenticated: true,
        getIdTokenClaims,
        getAccessToken,
      }),
    )

    render(
      <AuthProvider config={mockConfig}>
        <AuthStateProbe />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByText('user: user-123')).toBeInTheDocument())
    await waitFor(() => expect(getAccessToken).toHaveBeenCalledTimes(2), { timeout: 3000 })

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 2000))
    })

    expect(getAccessToken).toHaveBeenCalledTimes(2)
  }, 10000)
})

// ---------------------------------------------------------------------------
// Popup Sign-in Flow (task 5.3)
// ---------------------------------------------------------------------------

describe('Popup Sign-in Flow', () => {
  /** Minimal popup handle returned by window.open mock. */
  let mockPopup: { closed: boolean; close: ReturnType<typeof vi.fn> }

  /**
   * Helper component that triggers signIn with usePopup=true so we can
   * exercise the popup branch without depending on enablePopupSignIn default.
   */
  const PopupTrigger = () => {
    const { signIn } = useAuthContext()
    return <button onClick={() => signIn(undefined, true)}>Open Popup</button>
  }

  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(useLogto).mockReturnValue(createMockLogtoContext())
    mockPopup = { closed: false, close: vi.fn() }
    // Replace window.open with a mock that returns our popup handle
    Object.defineProperty(window, 'open', {
      value: vi.fn().mockReturnValue(mockPopup),
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── 1. Popup opens with correct parameters ──────────────────────────────

  it('opens the popup with /signin?popup=true, the correct window name, and 500×770 features', async () => {
    render(
      <AuthProvider config={mockConfig} enablePopupSignIn>
        <PopupTrigger />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByText('Open Popup')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Open Popup'))

    expect(window.open).toHaveBeenCalledWith('/signin?popup=true', 'SignInPopup', expect.stringContaining('width=500'))
    expect(window.open).toHaveBeenCalledWith('/signin?popup=true', 'SignInPopup', expect.stringContaining('height=770'))
  })

  // ── 2. Popup blocked by the browser ─────────────────────────────────────

  it('warns and returns early (no crash, no interval) when the popup is blocked', async () => {
    // Browser blocked the popup — window.open returns null
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    (window.open as ReturnType<typeof vi.fn>).mockReturnValue(null)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(
      <AuthProvider config={mockConfig} enablePopupSignIn>
        <PopupTrigger />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByText('Open Popup')).toBeInTheDocument())

    // Should not throw
    expect(() => fireEvent.click(screen.getByText('Open Popup'))).not.toThrow()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('blocked'))

    warnSpy.mockRestore()
  })

  // ── 3. SIGNIN_SUCCESS closes popup and clears message listener ───────────

  it('closes the popup and clears the message listener when SIGNIN_SUCCESS is received', async () => {
    // Spy on addEventListener to capture the 'message' handler
    const addELSpy = vi.spyOn(window, 'addEventListener')

    render(
      <AuthProvider config={mockConfig} enablePopupSignIn>
        <PopupTrigger />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByText('Open Popup')).toBeInTheDocument())

    // Record how many message listeners exist before the click
    const beforeCount = addELSpy.mock.calls.filter(([t]) => t === 'message').length
    fireEvent.click(screen.getByText('Open Popup'))

    // Locate the handler registered by the popup sign-in flow
    const msgCalls = addELSpy.mock.calls.filter(([t]) => t === 'message')
    expect(msgCalls.length).toBeGreaterThan(beforeCount)

    const messageHandler = msgCalls[msgCalls.length - 1][1] as (e: unknown) => void

    // Deliver a SIGNIN_SUCCESS message that appears to originate from the popup.
    // We pass a plain object because the handler only reads .origin, .source, and .data —
    // it does not require a real MessageEvent instance.
    await act(async () => {
      messageHandler({
        origin: window.location.origin,
        source: mockPopup, // matches the popup handle returned by window.open
        data: { type: 'SIGNIN_SUCCESS' },
      })
    })

    expect(mockPopup.close).toHaveBeenCalledOnce()
  })

  // ── 4. SIGNIN_COMPLETE (alias) also accepted ─────────────────────────────

  it('also accepts SIGNIN_COMPLETE (the SignInPage variant) as a success signal', async () => {
    const addELSpy = vi.spyOn(window, 'addEventListener')

    render(
      <AuthProvider config={mockConfig} enablePopupSignIn>
        <PopupTrigger />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByText('Open Popup')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Open Popup'))

    const msgCalls = addELSpy.mock.calls.filter(([t]) => t === 'message')
    const messageHandler = msgCalls[msgCalls.length - 1][1] as (e: unknown) => void

    await act(async () => {
      messageHandler({
        origin: window.location.origin,
        source: mockPopup,
        data: { type: 'SIGNIN_COMPLETE' },
      })
    })

    expect(mockPopup.close).toHaveBeenCalledOnce()
  })

  // ── 5. Cross-origin messages are ignored ─────────────────────────────────

  it('ignores messages from a different origin (prevents cross-origin spoofing)', async () => {
    const addELSpy = vi.spyOn(window, 'addEventListener')

    render(
      <AuthProvider config={mockConfig} enablePopupSignIn>
        <PopupTrigger />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByText('Open Popup')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Open Popup'))

    const msgCalls = addELSpy.mock.calls.filter(([t]) => t === 'message')
    const messageHandler = msgCalls[msgCalls.length - 1][1] as (e: unknown) => void

    // Send message from a DIFFERENT origin
    await act(async () => {
      messageHandler({
        origin: 'https://evil.example.com',
        source: mockPopup,
        data: { type: 'SIGNIN_SUCCESS' },
      })
    })

    // popup.close must NOT have been called — the message was rejected
    expect(mockPopup.close).not.toHaveBeenCalled()
  })

  // ── 6. Same-origin spoof (wrong source) is ignored ───────────────────────

  it('ignores same-origin messages that do not come from the popup window', async () => {
    const addELSpy = vi.spyOn(window, 'addEventListener')

    render(
      <AuthProvider config={mockConfig} enablePopupSignIn>
        <PopupTrigger />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByText('Open Popup')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Open Popup'))

    const msgCalls = addELSpy.mock.calls.filter(([t]) => t === 'message')
    const messageHandler = msgCalls[msgCalls.length - 1][1] as (e: unknown) => void

    // Correct origin, but source is a DIFFERENT object (same-origin spoof)
    const otherWindow = { closed: false, close: vi.fn() }
    await act(async () => {
      messageHandler({
        origin: window.location.origin,
        source: otherWindow, // NOT the popup we opened
        data: { type: 'SIGNIN_SUCCESS' },
      })
    })

    expect(mockPopup.close).not.toHaveBeenCalled()
  })

  // ── 7. 5-minute auto-cleanup ─────────────────────────────────────────────

  it('removes the message listener after the 5-minute auto-cleanup timeout', async () => {
    render(
      <AuthProvider config={mockConfig} enablePopupSignIn>
        <PopupTrigger />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByText('Open Popup')).toBeInTheDocument())

    // Switch to fake timers AFTER initial render/effects so waitFor above works normally
    vi.useFakeTimers()

    const removeELSpy = vi.spyOn(window, 'removeEventListener')
    fireEvent.click(screen.getByText('Open Popup'))

    // Advance past the 300,000 ms (5-minute) cleanup timeout
    await act(async () => {
      vi.advanceTimersByTime(300_001)
    })

    expect(removeELSpy).toHaveBeenCalledWith('message', expect.any(Function))
  })
})
