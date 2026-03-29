'use client'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from './useAuth.js'
import LoadingSpinner from './components/ui/loading-spinner.js'
import type { SignInPageProps } from './types.js'

/**
 * SignInPage Component
 *
 * Internal page component that auto-initiates the sign-in flow. This is a special route
 * that automatically starts the Logto sign-in process when loaded.
 *
 * In redirect flow:
 * - If user is not authenticated, initiates sign-in redirect to Logto
 * - User is redirected back to /callback after Logto authentication
 * - Redirects to home page on success
 *
 * In popup flow (when opened from parent with ?popup=true):
 * - Detects it's running in a popup (via window.opener or sessionStorage flag)
 * - Initiates sign-in without opening nested popups
 * - Notifies parent window via postMessage when complete
 * - Self-closes the popup
 *
 * @component
 *
 * @example
 * // Set up route for the sign-in page
 * // In Next.js or React Router
 * <Route path="/signin" component={SignInPage} />
 *
 * // AuthProvider with popup sign-in enabled
 * <AuthProvider config={logtoConfig} enablePopupSignIn={true}>
 *   <App />
 * </AuthProvider>
 *
 * @param {string} [className] - CSS classes to apply to the loading/error container
 * @param {React.ReactNode} [loadingComponent] - Custom loading UI shown while auth state is resolving
 * @param {React.ReactNode | ((error: Error) => React.ReactNode)} [errorComponent] - Custom error UI shown if sign-in initiation fails
 *
 * @returns {React.ReactElement|null} Loading spinner during auth, null otherwise
 *
 * @see {@link CallbackPage} for the callback handler page
 * @see {@link SignInButton} for a button component to trigger sign-in
 *
 * @internal
 */
export function SignInPage({ className = '', loadingComponent, errorComponent }: SignInPageProps) {
  const { user, signIn, isLoadingUser } = useAuth()
  const signInInProgress = useRef(false)
  const [signInError, setSignInError] = useState<Error | null>(null)

  useEffect(() => {
    if (isLoadingUser) return

    // Detect if this window was opened by another window (popup flow).
    // Also check the URL param set by the opener and persist it to sessionStorage
    // so it survives the cross-origin round-trip through Logto.
    const searchParams = new URLSearchParams(window.location.search)
    if (searchParams.get('popup') === 'true') {
      sessionStorage.setItem('simple_logto_popup_flow', 'true')
    }

    const isPopup = (window.opener && window.opener !== window) || sessionStorage.getItem('simple_logto_popup_flow') === 'true'

    if (user) {
      // User is already authenticated - redirect or close popup
      if (isPopup) {
        // Try to notify parent window, but handle case where opener is gone
        if (window.opener && window.opener !== window) {
          try {
            window.opener.postMessage({ type: 'SIGNIN_COMPLETE' }, window.location.origin)
          } catch (e) {
            console.error('Failed to post message to opener:', e)
            // Use fallback method
            localStorage.setItem('simple_logto_signin_complete', Date.now().toString())
          }
        } else {
          // Fallback: opener is gone, use localStorage broadcast
          localStorage.setItem('simple_logto_signin_complete', Date.now().toString())
        }
        // Clean up and close
        sessionStorage.removeItem('simple_logto_popup_flow')
        console.log('[SignInPage] Closing popup')
        setTimeout(() => window.close(), 100)
      } else {
        if (window.location.pathname !== '/') {
          window.location.href = '/'
        }
      }
      return
    }

    // Initiate sign-in if not already in progress
    if (!signInInProgress.current) {
      signInInProgress.current = true
      setSignInError(null)
      // Pass false to prevent nested popups when already in a popup
      void signIn(undefined, false).catch((error: unknown) => {
        signInInProgress.current = false
        setSignInError(error instanceof Error ? error : new Error('Failed to start sign-in'))
      })
    }
  }, [user, isLoadingUser, signIn])

  if (signInError) {
    return (
      <div className={`flex min-h-screen items-center justify-center ${className}`.trim()}>
        {typeof errorComponent === 'function' ? errorComponent(signInError) : (errorComponent ?? <div role="alert">Failed to start sign-in. Please try again.</div>)}
      </div>
    )
  }

  if (isLoadingUser) {
    return (
      <div className={`flex min-h-screen items-center justify-center ${className}`.trim()}>
        {loadingComponent ?? <LoadingSpinner />}
      </div>
    )
  }

  return null
}
