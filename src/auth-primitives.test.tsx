import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SignInDialog } from './auth-primitives.js'

const openSignIn = vi.fn()

vi.mock('./useAuth.js', () => ({
  useAuth: () => ({
    user: null,
    isLoaded: true,
    isSignedIn: false,
    error: null,
    openSignIn,
  }),
}))

describe('SignInDialog', () => {
  beforeEach(() => openSignIn.mockReset().mockResolvedValue(undefined))

  it('renders consumer branding without a product-specific default', () => {
    render(<SignInDialog defaultOpen branding={{ name: 'Example', logoUrl: '/logo.svg' }} title="Continue to Example" />)
    expect(screen.getByText('Continue to Example')).toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAttribute('src', '/logo.svg')
    expect(screen.queryByText('Ouim')).not.toBeInTheDocument()
  })

  it('starts the selected provider in a correlated popup flow', async () => {
    render(<SignInDialog defaultOpen returnTo="/dashboard" providers={[{ strategy: 'google', label: 'Use Google' }]} />)
    fireEvent.click(screen.getByRole('button', { name: /Use Google/i }))
    await waitFor(() => expect(openSignIn).toHaveBeenCalledWith({ strategy: 'google', mode: 'popup', returnTo: '/dashboard' }))
  })

  it('accepts slot classes and removes optional branding and footnotes', () => {
    render(<SignInDialog defaultOpen branding={{ logo: null }} footnote={null} appearance={{ classNames: { dialog: 'consumer-dialog' } }} />)
    expect(screen.getByRole('dialog')).toHaveClass('consumer-dialog')
    expect(screen.queryByText(/secure window/i)).not.toBeInTheDocument()
  })
})
