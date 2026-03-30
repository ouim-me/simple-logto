import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UserCenter } from './user-center'
import type { LogtoUser } from './types'

const mockNavigate = vi.fn()

// Mock useAuth hook
const mockUseAuth = vi.fn()
vi.mock('./useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock('./navigation', () => ({
  useNavigation: () => mockNavigate,
}))

// Mock utility functions
vi.mock('./utils', () => ({
  getInitials: (name?: string) => {
    if (!name) return ''
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
  },
  cn: (...classes: any[]) => classes.filter(Boolean).join(' '),
}))

// Mock UI components
vi.mock('./components/ui/avatar', () => ({
  Avatar: ({ children, className }: any) => (
    <div data-testid="avatar" className={className}>
      {children}
    </div>
  ),
  AvatarImage: ({ src, alt }: any) => <img data-testid="avatar-image" src={src} alt={alt} />,
  AvatarFallback: ({ children, className }: any) => (
    <div data-testid="avatar-fallback" className={className}>
      {children}
    </div>
  ),
}))

vi.mock('./components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) => <div data-testid="dropdown-menu">{children}</div>,
  DropdownMenuTrigger: ({ children, className }: any) => (
    <button data-testid="dropdown-trigger" className={className}>
      {children}
    </button>
  ),
  DropdownMenuContent: ({ children, className }: any) => (
    <div data-testid="dropdown-content" className={className}>
      {children}
    </div>
  ),
  DropdownMenuLabel: ({ children }: any) => <div data-testid="dropdown-label">{children}</div>,
  DropdownMenuSeparator: ({ className }: any) => <div data-testid="dropdown-separator" className={className} />,
  DropdownMenuItem: ({ children, onSelect, onClick }: any) => (
    <div
      data-testid="dropdown-item"
      onClick={() => {
        onSelect?.()
        onClick?.()
      }}
    >
      {children}
    </div>
  ),
}))

vi.mock('./components/ui/button', () => ({
  Button: ({ children, className, variant, onClick }: any) => (
    <button data-testid="button" className={className} data-variant={variant} onClick={onClick}>
      {children}
    </button>
  ),
}))

// Mock lucide react icons
vi.mock('lucide-react', () => ({
  User: () => <span data-testid="icon-user">User Icon</span>,
  LogOut: () => <span data-testid="icon-logout">LogOut Icon</span>,
  UserCircle: () => <span data-testid="icon-usercircle">UserCircle Icon</span>,
}))

describe('UserCenter Component', () => {
  const mockUser: LogtoUser = {
    id: 'user-123',
    name: 'John Doe',
    email: 'john@example.com',
    avatar: 'https://example.com/avatar.jpg',
  }

  const defaultMockAuth = {
    user: null,
    isLoadingUser: false,
    signOut: vi.fn(),
    signIn: vi.fn(),
    isAuthenticated: false,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuth.mockReturnValue(defaultMockAuth)

    // Mock window.location
    delete (window as any).location
    window.location = { href: 'https://example.com/current-page' } as any
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Loading State', () => {
    it('should show loading spinner when isLoadingUser is true', () => {
      mockUseAuth.mockReturnValue({
        ...defaultMockAuth,
        isLoadingUser: true,
      })

      const { container } = render(<UserCenter />)

      // Before hasMounted, show loading
      const loader = container.querySelector('.animate-pulse')
      expect(loader).toBeTruthy()
    })

    it('should prevent hydration mismatch during initial mount', () => {
      mockUseAuth.mockReturnValue({
        ...defaultMockAuth,
        user: mockUser,
        isLoadingUser: false,
      })

      const { container: _container } = render(<UserCenter />)

      // Component should use Avatar component when user is loaded
      const avatar = screen.getByTestId('avatar')
      expect(avatar).toBeTruthy()
    })

    it('should show loading skeleton with pulsing effect', () => {
      mockUseAuth.mockReturnValue({
        ...defaultMockAuth,
        isLoadingUser: true,
      })

      const { container } = render(<UserCenter />)

      // The loading div should have animate-pulse class
      const loadingDiv = container.querySelector('.animate-pulse')
      expect(loadingDiv).toBeTruthy()
    })
  })

  describe('Authenticated User State', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        ...defaultMockAuth,
        user: mockUser,
        isLoadingUser: false,
      })
    })

    it('should display user avatar image when available', () => {
      render(<UserCenter />)

      const avatarImage = screen.queryByTestId('avatar-image')
      expect(avatarImage?.getAttribute('src')).toBe(mockUser.avatar)
    })

    it('should display user initials fallback when no avatar', () => {
      mockUseAuth.mockReturnValue({
        ...defaultMockAuth,
        user: { ...mockUser, avatar: undefined },
        isLoadingUser: false,
      })

      render(<UserCenter />)

      const fallback = screen.getByTestId('avatar-fallback')
      expect(fallback?.textContent).toContain('JD') // John Doe initials
    })

    it('should display user name in dropdown', () => {
      render(<UserCenter />)

      const label = screen.getByTestId('dropdown-label')
      expect(label?.textContent).toContain('John Doe')
    })

    it('should display user email in dropdown', () => {
      render(<UserCenter />)

      const label = screen.getByTestId('dropdown-label')
      expect(label?.textContent).toContain('john@example.com')
    })

    it('should display sign-out button', () => {
      render(<UserCenter />)

      const buttons = screen.getAllByTestId('button')
      const signOutButton = buttons.find(btn => btn.textContent?.includes('Sign out'))
      expect(signOutButton).toBeTruthy()
    })

    it('should call signOut with correct parameters', () => {
      const signOut = vi.fn()
      mockUseAuth.mockReturnValue({
        ...defaultMockAuth,
        user: mockUser,
        isLoadingUser: false,
        signOut,
      })

      render(<UserCenter />)

      const buttons = screen.getAllByTestId('button')
      const signOutButton = buttons.find(btn => btn.textContent?.includes('Sign out'))
      signOutButton?.click()

      expect(signOut).toHaveBeenCalledWith({
        callbackUrl: 'https://example.com/current-page',
        global: false,
      })
    })

    it('should default to local sign-out for safer account-menu behavior', () => {
      const signOut = vi.fn()
      mockUseAuth.mockReturnValue({
        ...defaultMockAuth,
        user: mockUser,
        isLoadingUser: false,
        signOut,
      })

      render(<UserCenter />)

      const buttons = screen.getAllByTestId('button')
      const signOutButton = buttons.find(btn => btn.textContent?.includes('Sign out'))
      signOutButton?.click()

      expect(signOut).toHaveBeenCalledWith({
        callbackUrl: 'https://example.com/current-page',
        global: false,
      })
    })

    it('should use globalSignOut prop', () => {
      const signOut = vi.fn()
      mockUseAuth.mockReturnValue({
        ...defaultMockAuth,
        user: mockUser,
        isLoadingUser: false,
        signOut,
      })

      render(<UserCenter globalSignOut={false} />)

      const buttons = screen.getAllByTestId('button')
      const signOutButton = buttons.find(btn => btn.textContent?.includes('Sign out'))
      signOutButton?.click()

      expect(signOut).toHaveBeenCalledWith({
        callbackUrl: expect.any(String),
        global: false,
      })
    })

    it('should use signoutCallbackUrl prop', () => {
      const signOut = vi.fn()
      const customUrl = 'https://example.com/custom-logout'
      mockUseAuth.mockReturnValue({
        ...defaultMockAuth,
        user: mockUser,
        isLoadingUser: false,
        signOut,
      })

      render(<UserCenter signoutCallbackUrl={customUrl} />)

      const buttons = screen.getAllByTestId('button')
      const signOutButton = buttons.find(btn => btn.textContent?.includes('Sign out'))
      signOutButton?.click()

      expect(signOut).toHaveBeenCalledWith({
        callbackUrl: customUrl,
        global: false,
      })
    })
  })

  describe('Unauthenticated User State', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        ...defaultMockAuth,
        user: null,
        isLoadingUser: false,
      })
    })

    it('should show user circle placeholder when not authenticated', () => {
      render(<UserCenter />)

      const fallback = screen.getByTestId('avatar-fallback')
      expect(fallback?.textContent).toContain('UserCircle Icon')
    })

    it('should display "Sign in to your account" message', () => {
      render(<UserCenter />)

      const label = screen.getByTestId('dropdown-label')
      expect(label?.textContent).toContain('Sign in to your account')
    })

    it('should display sign-in button', () => {
      render(<UserCenter />)

      const buttons = screen.getAllByTestId('button')
      const signInButton = buttons.find(btn => btn.textContent?.includes('Sign in'))
      expect(signInButton).toBeTruthy()
    })

    it('should call signIn when sign-in button clicked', () => {
      const signIn = vi.fn()
      mockUseAuth.mockReturnValue({
        ...defaultMockAuth,
        user: null,
        isLoadingUser: false,
        signIn,
      })

      render(<UserCenter />)

      const buttons = screen.getAllByTestId('button')
      const signInButton = buttons.find(btn => btn.textContent?.includes('Sign in'))
      signInButton?.click()

      expect(signIn).toHaveBeenCalled()
    })
  })

  describe('Additional Pages', () => {
    it('should render additional pages', () => {
      mockUseAuth.mockReturnValue({
        ...defaultMockAuth,
        user: mockUser,
        isLoadingUser: false,
      })

      const additionalPages = [
        { link: '/settings', text: 'Settings' },
        { link: '/profile', text: 'Profile' },
      ]

      render(<UserCenter additionalPages={additionalPages} />)

      const items = screen.getAllByTestId('dropdown-item')
      // Should have additional pages + sign-out button
      expect(items.length).toBeGreaterThanOrEqual(2)
    })

    it('should navigate to page link when clicked', () => {
      mockUseAuth.mockReturnValue({
        ...defaultMockAuth,
        user: mockUser,
        isLoadingUser: false,
      })

      const additionalPages = [{ link: '/settings', text: 'Settings' }]

      render(<UserCenter additionalPages={additionalPages} />)

      const items = screen.getAllByTestId('dropdown-item')
      const settingsItem = items.find(item => item.textContent?.includes('Settings'))

      settingsItem?.click()

      expect(mockNavigate).toHaveBeenCalledWith('/settings')
    })

    it('should render separators only when additional pages exist', () => {
      mockUseAuth.mockReturnValue({
        ...defaultMockAuth,
        user: mockUser,
        isLoadingUser: false,
      })

      // Without additional pages
      const { rerender } = render(<UserCenter additionalPages={[]} />)

      let separators = screen.getAllByTestId('dropdown-separator')
      const initialSeparatorCount = separators.length

      // With additional pages
      const additionalPages = [{ link: '/settings', text: 'Settings' }]

      rerender(<UserCenter additionalPages={additionalPages} />)

      separators = screen.getAllByTestId('dropdown-separator')
      // Should have more separators now
      expect(separators.length).toBeGreaterThan(initialSeparatorCount)
    })

    it('should render additional pages with icons', () => {
      mockUseAuth.mockReturnValue({
        ...defaultMockAuth,
        user: mockUser,
        isLoadingUser: false,
      })

      const additionalPages = [{ link: '/settings', text: 'Settings', icon: <span data-testid="custom-icon">⚙️</span> }]

      render(<UserCenter additionalPages={additionalPages} />)

      const icon = screen.queryByTestId('custom-icon')
      expect(icon?.textContent).toBe('⚙️')
    })
  })

  describe('Props Handling', () => {
    it('should apply custom className', () => {
      mockUseAuth.mockReturnValue({
        ...defaultMockAuth,
        user: mockUser,
        isLoadingUser: false,
      })

      const { container } = render(<UserCenter className="custom-class" />)

      const div = container.querySelector('.custom-class')
      expect(div).toBeTruthy()
    })

    it('should apply custom themeClassnames', () => {
      mockUseAuth.mockReturnValue({
        ...defaultMockAuth,
        user: mockUser,
        isLoadingUser: false,
      })

      const customTheme = 'dark:bg-slate-900 dark:text-white bg-gray-50 text-gray-900'
      render(<UserCenter themeClassnames={customTheme} />)

      const content = screen.getByTestId('dropdown-content')
      expect(content?.className).toContain('dark:bg-slate-900')
    })
  })

  describe('Edge Cases', () => {
    it('should handle user with name but no email', () => {
      mockUseAuth.mockReturnValue({
        ...defaultMockAuth,
        user: { ...mockUser, email: undefined },
        isLoadingUser: false,
      })

      render(<UserCenter />)

      const label = screen.getByTestId('dropdown-label')
      expect(label?.textContent).toContain('John Doe')
      expect(label?.textContent).not.toContain('john@example.com')
    })

    it('should handle user with email but no name', () => {
      mockUseAuth.mockReturnValue({
        ...defaultMockAuth,
        user: { ...mockUser, name: undefined },
        isLoadingUser: false,
      })

      render(<UserCenter />)

      const label = screen.getByTestId('dropdown-label')
      expect(label?.textContent).toContain('User') // Default name
      expect(label?.textContent).toContain('john@example.com')
    })

    it('should handle user without avatar or name', () => {
      mockUseAuth.mockReturnValue({
        ...defaultMockAuth,
        user: { id: 'user-123', email: 'user@example.com' },
        isLoadingUser: false,
      })

      render(<UserCenter />)

      const fallback = screen.getByTestId('avatar-fallback')
      expect(fallback).toBeTruthy()
    })

    it('should use current location href as default signout URL', () => {
      const signOut = vi.fn()
      mockUseAuth.mockReturnValue({
        ...defaultMockAuth,
        user: mockUser,
        isLoadingUser: false,
        signOut,
      })

      render(<UserCenter />)

      const buttons = screen.getAllByTestId('button')
      const signOutButton = buttons.find(btn => btn.textContent?.includes('Sign out'))
      signOutButton?.click()

      expect(signOut).toHaveBeenCalledWith({
        callbackUrl: 'https://example.com/current-page',
        global: false,
      })
    })
  })

  describe('Dropdown Behavior', () => {
    it('should render dropdown menu trigger', () => {
      mockUseAuth.mockReturnValue({
        ...defaultMockAuth,
        user: mockUser,
        isLoadingUser: false,
      })

      render(<UserCenter />)

      const trigger = screen.getByTestId('dropdown-trigger')
      expect(trigger).toBeTruthy()
    })

    it('should render dropdown content', () => {
      mockUseAuth.mockReturnValue({
        ...defaultMockAuth,
        user: mockUser,
        isLoadingUser: false,
      })

      render(<UserCenter />)

      const content = screen.getByTestId('dropdown-content')
      expect(content).toBeTruthy()
    })
  })

  describe('Accessibility', () => {
    it('should have outline-none on trigger button', () => {
      mockUseAuth.mockReturnValue({
        ...defaultMockAuth,
        user: mockUser,
        isLoadingUser: false,
      })

      render(<UserCenter />)

      const trigger = screen.getByTestId('dropdown-trigger')
      expect(trigger?.className).toContain('outline-none')
    })

    it('should have proper avatar size classes', () => {
      mockUseAuth.mockReturnValue({
        ...defaultMockAuth,
        user: mockUser,
        isLoadingUser: false,
      })

      render(<UserCenter />)

      const avatar = screen.getByTestId('avatar')
      expect(avatar?.className).toContain('h-8')
      expect(avatar?.className).toContain('w-8')
    })
  })
})
