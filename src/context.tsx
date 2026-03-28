'use client'
import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { LogtoConfig, LogtoProvider, useLogto } from '@logto/react'
import { transformUser, setCustomNavigate, jwtCookieUtils, guestUtils, validateLogtoConfig } from './utils'
import type { AuthContextType, AuthProviderProps, LogtoUser } from './types'

const POPUP_AUTH_EVENT_DELAY = 500

// Create auth context
const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Client-only wrapper to prevent SSR issues
const ClientOnly = ({ children }: { children: React.ReactNode }) => {
  const [hasMounted, setHasMounted] = useState(false)

  useEffect(() => {
    setHasMounted(true)
  }, [])

  if (!hasMounted) {
    return null
  }

  return <>{children}</>
}

/**
 * POPUP SIGN-IN AUTH REFRESH FIX OVERVIEW:
 *
 * When a user authenticates via a popup window, the parent window must detect
 * the completion and refresh its auth state. The flow works as follows:
 *
 * 1. Parent opens popup with window.open() pointing to /signin?popup=true
 * 2. Popup navigates through Logto auth flow and reaches CallbackPage
 * 3. CallbackPage calls useHandleSignInCallback() which exchanges auth code for tokens
 * 4. CallbackPage sends postMessage to parent or sets localStorage (fallback)
 * 5. Parent receives signal and must refresh auth state
 *
 * KEY CHALLENGES ADDRESSED:
 * - Popup authentication completes in a separate window context
 * - Logto tokens stored in shared localStorage but parent's Logto instance hasn't noticed yet
 * - Parent's isAuthenticated flag is still false when signal arrives
 * - Rate limiting (1s minimum interval) could block auth refresh
 * - Logto's isLoading flag might be true, causing early returns
 *
 * SOLUTION:
 * - loadUser() now accepts optional forceRefresh parameter
 * - forceRefresh=true bypasses rate limiting and isLoading checks
 * - 500ms delay after popup signals allow Logto to sync state from shared storage
 * - Three signal sources all use forceRefresh: postMessage, localStorage, popup closure
 * SIGNAL FLOW:
 * postMessage (primary) → setTimeout(500ms) → loadUser(true) → fetch claims → update user
 * localStorage (fallback) → setTimeout(500ms) → loadUser(true) → fetch claims → update user
 * popup?.closed (fallback #2) → setTimeout(500ms) → loadUser(true) → fetch claims → update user
 */

// Internal provider that wraps Logto's context
const InternalAuthProvider = ({
  children,
  callbackUrl,
  enablePopupSignIn,
  logtoConfig,
}: {
  children: React.ReactNode
  callbackUrl?: string
  enablePopupSignIn?: boolean
  logtoConfig: LogtoConfig // Logto configuration object
}) => {
  const { isAuthenticated, isLoading, getIdTokenClaims, getAccessToken, signIn: logtoSignIn, signOut: logtoSignOut } = useLogto()
  const [user, setUser] = useState<LogtoUser | null>(null)
  const [isLoadingUser, setIsLoadingUser] = useState<boolean>(true)
  const defaultResource = logtoConfig?.resources?.[0] || 'urn:logto:resource:default'

  // Rate limiting to prevent infinite calls
  const lastLoadTime = useRef<number>(0)
  const errorCount = useRef<number>(0)
  const MAX_ERROR_COUNT = 3
  const MIN_LOAD_INTERVAL = 1000 // 1 second between calls

  const loadUser = useCallback(
    async (forceRefresh?: boolean) => {
      // Only skip if Logto is loading AND we're not forcing a refresh
      // (forceRefresh is used for explicit popup completion events)
      if (isLoading && !forceRefresh) return

      // Rate limiting check - but allow bypass for forced refreshes
      const now = Date.now()
      if (!forceRefresh && now - lastLoadTime.current < MIN_LOAD_INTERVAL) {
        return
      }
      lastLoadTime.current = now

      setIsLoadingUser(true)

      if (isAuthenticated) {
        try {
          const claims = await getIdTokenClaims()
          const jwt = await getAccessToken(defaultResource)

          if (jwt) {
            // Only set user as logged in if we actually have a valid access token
            jwtCookieUtils.saveToken(jwt)
            setUser(transformUser(claims))
            // Reset error count on success
            errorCount.current = 0
          } else {
            // Refresh token expired (e.g. user was gone > 30 days) — session is dead.
            // The Logto SDK still reports isAuthenticated=true because it reads stale
            // localStorage, but we have no usable token, so we must log out cleanly.
            console.warn('Access token unavailable — session likely expired. Forcing logout.')
            setUser(null)
            jwtCookieUtils.removeToken()
            await logtoSignOut()
          }
        } catch (error: unknown) {
          console.error('Error fetching user claims:', error)
          errorCount.current += 1

          // Clear user state and remove token on any authentication error
          setUser(null)
          jwtCookieUtils.removeToken()

          // If we've hit max errors or it's clearly an auth error, force logout
          const isAuthError =
            (error instanceof Error && error.message.includes('invalid')) ||
            (error instanceof Error && error.message.includes('expired')) ||
            (error instanceof Error && error.message.includes('Grant request is invalid')) ||
            (typeof error === 'object' && error !== null && 'code' in error && error.code === 'invalid_grant') ||
            errorCount.current >= MAX_ERROR_COUNT

          if (isAuthError) {
            console.warn('Authentication error detected, forcing logout:', error instanceof Error ? error.message : error)
            try {
              // Force a complete logout to clear all auth state
              await logtoSignOut()
            } catch (logoutError) {
              console.error('Error during forced logout:', logoutError)
              // Even if logout fails, dispatch event to notify other components
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('auth-state-changed'))
              }
            }
            // Reset error count after logout
            errorCount.current = 0
          }
        }
      } else {
        setUser(null)
        // Remove token cookie when not authenticated
        jwtCookieUtils.removeToken()
        // Reset error count when not authenticated
        errorCount.current = 0
      }

      setIsLoadingUser(false)
    },
    [defaultResource, getAccessToken, getIdTokenClaims, isAuthenticated, isLoading, logtoSignOut],
  )

  useEffect(() => {
    loadUser()
  }, [loadUser])

  // Store the latest loadUser function in a ref to avoid recreating event listeners
  const loadUserRef = useRef(loadUser)
  loadUserRef.current = loadUser

  // Add effect to handle cross-window/tab authentication state changes
  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return

    guestUtils.ensureGuestId() // Ensure guest ID is set

    let lastFocusTime = 0

    // Listen for storage changes (when auth state changes in other tabs)
    const handleStorageChange = (e: StorageEvent) => {
      // Logto typically stores auth state in localStorage
      if (e.key && (e.key.includes('logto') || e.key.includes('auth'))) {
        // Refresh auth state when storage changes
        setTimeout(() => {
          loadUserRef.current()
        }, 100) // Small delay to ensure storage is updated
      }

      // Fallback: popup completed auth but window.opener was unavailable, so it wrote to localStorage
      if (e.key === 'simple_logto_signin_complete') {
        localStorage.removeItem('simple_logto_signin_complete')
        // Use a longer delay and forceRefresh for explicit popup completion events
        setTimeout(() => {
          window.location.reload() // Ensure the app state is updated for the authenticated user

          loadUserRef.current(true) // forceRefresh=true to bypass rate limiting
          window.dispatchEvent(new CustomEvent('auth-state-changed'))
        }, POPUP_AUTH_EVENT_DELAY)
      }
    }

    // Listen for window focus to refresh auth state
    const handleWindowFocus = () => {
      // Only refresh if it's been more than 1 second since last focus
      // to prevent excessive re-renders
      const now = Date.now()
      if (now - lastFocusTime > 1000) {
        lastFocusTime = now
        loadUserRef.current()
      }
    }

    // Listen for custom auth change events
    const handleAuthChange = () => {
      loadUserRef.current()
    }

    // Add event listeners
    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('focus', handleWindowFocus)
    window.addEventListener('auth-state-changed', handleAuthChange)

    // Cleanup function
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('focus', handleWindowFocus)
      window.removeEventListener('auth-state-changed', handleAuthChange)
    }
  }, []) // Empty dependency array to prevent recreating listeners

  const signIn = useCallback(
    async (overrideCallbackUrl?: string, usePopup?: boolean) => {
      // Only run on client side
      if (typeof window === 'undefined') return

      // Check if we're already in a popup to prevent infinite loops
      const isInPopup = window.opener && window.opener !== window

      if (isInPopup) {
        // If we're already in a popup, just do direct sign-in without opening another popup
        const redirectUrl = overrideCallbackUrl || callbackUrl || window.location.href
        try {
          await logtoSignIn(redirectUrl)
        } catch (error) {
          console.error('Sign-in failed:', error)
          throw error
        }
        return
      }

      const shouldUsePopup = usePopup ?? enablePopupSignIn

      if (!shouldUsePopup) {
        const redirectUrl = overrideCallbackUrl || callbackUrl || window.location.href
        try {
          await logtoSignIn(redirectUrl)
        } catch (error) {
          console.error('Sign-in failed:', error)
          throw error
        }
      } else {
        // Use popup sign-in
        const popupWidth = 500
        const popupHeight = 770
        const left = window.innerWidth / 2 - popupWidth / 2
        const top = window.innerHeight / 2 - popupHeight / 2
        const popupFeatures = `width=${popupWidth},height=${popupHeight},left=${left},top=${top},resizable=yes,scrollbars=yes,status=yes`

        // Use the signin page route - assume user has it at /signin
        const popup = window.open('/signin?popup=true', 'SignInPopup', popupFeatures)

        if (!popup) {
          // Popup was blocked by the browser — no interval is running, nothing to clean up
          console.warn('Sign-in popup was blocked by the browser. Users may need to allow popups for this site.')
          return
        }

        // Declared before handleMessage so the closure can reference it once assigned
        let cleanupTimeoutId: ReturnType<typeof setTimeout> | undefined

        // Listen for the popup to close or complete authentication
        const checkClosed = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkClosed)
            // Popup closed - add delay and use forceRefresh to detect auth completion
            setTimeout(() => {
              loadUserRef.current(true) // forceRefresh=true to bypass rate limiting and isLoading check
              window.location.reload() // Ensure the app state is updated for the authenticated user
              window.dispatchEvent(new CustomEvent('auth-state-changed'))
            }, POPUP_AUTH_EVENT_DELAY)
          }
        }, 1000)

        // Listen for messages from the popup
        const handleMessage = (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return

          if (event.data.type === 'SIGNIN_SUCCESS' || event.data.type === 'SIGNIN_COMPLETE') {
            // Cancel the 5-minute stale cleanup and remove all listeners immediately
            clearTimeout(cleanupTimeoutId)
            window.removeEventListener('message', handleMessage)
            clearInterval(checkClosed)
            popup.close()
            // Add delay to let Logto's internal state update from shared token storage
            // This is crucial because the popup completed auth in a separate context
            setTimeout(() => {
              loadUserRef.current(true) // forceRefresh=true to bypass rate limiting
              window.location.reload() // Ensure the app state is updated for the authenticated user
              window.dispatchEvent(new CustomEvent('auth-state-changed'))
            }, POPUP_AUTH_EVENT_DELAY)
          }
        }

        window.addEventListener('message', handleMessage)

        // Cleanup listener and poll interval (called on 5-minute timeout)
        const cleanupListener = () => {
          window.removeEventListener('message', handleMessage)
          clearInterval(checkClosed)
        }

        // Auto-cleanup after 5 minutes if popup neither completes nor closes
        cleanupTimeoutId = setTimeout(cleanupListener, 300000)
      }
    },
    [enablePopupSignIn, callbackUrl, logtoSignIn],
  )

  const signOut = useCallback(
    async (options?: { callbackUrl?: string; global?: boolean }) => {
      // Only run on client side
      if (typeof window === 'undefined') return

      const { callbackUrl, global = true } = options || {}

      // Always remove the JWT token cookie on sign out
      jwtCookieUtils.removeToken()

      if (global) {
        // Global sign out - logs out from entire Logto ecosystem
        await logtoSignOut(callbackUrl)
      } else {
        // Local sign out - only clears local session
        setUser(null)
        setIsLoadingUser(false)

        // Optional: Clear any local storage or session storage if needed
        // localStorage.removeItem('logto_session')
        // sessionStorage.clear()

        if (callbackUrl) {
          window.location.href = callbackUrl
        }
      }

      // Dispatch custom event to notify other windows/tabs
      window.dispatchEvent(new CustomEvent('auth-state-changed'))
    },
    [logtoSignOut],
  )

  const value: AuthContextType = useMemo(
    () => ({
      user,
      isLoadingUser,
      signIn,
      signOut,
      refreshAuth: () => loadUserRef.current(),
      enablePopupSignIn,
    }),
    [user, isLoadingUser, signIn, signOut, enablePopupSignIn],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * AuthProvider Component
 *
 * Main authentication provider that wraps your application with Logto authentication.
 * Sets up authentication context, handles sign-in/sign-out flows, and manages auth state.
 *
 * @component
 * @param {React.ReactNode} children - React components to wrap with authentication context
 * @param {LogtoConfig} config - Logto configuration object containing endpoint, appId, and resources
 * @param {string} [callbackUrl] - Default URL to redirect to after authentication (e.g., '/dashboard'). Can be overridden per sign-in call
 * @param {Function} [customNavigate] - Custom navigation function for client-side routing (e.g., from React Router or Next.js). If not provided, uses window.location
 * @param {boolean} [enablePopupSignIn=false] - Enable popup-based sign-in flow (opens sign-in in a new window). Defaults to redirect flow
 *
 * @example
 * // Basic setup with Logto configuration
 * <AuthProvider config={{ endpoint: 'https://tenant.logto.app', appId: 'app_id_here', resources: { api: 'urn:logto:resource:api' } }}>
 *   <App />
 * </AuthProvider>
 *
 * @example
 * // With custom React Router navigation
 * import { useNavigate } from 'react-router-dom'
 *
 * function AuthProviderWrapper({ children }) {
 *   const navigate = useNavigate()
 *   return (
 *     <AuthProvider
 *       config={logtoConfig}
 *       callbackUrl="/dashboard"
 *       enablePopupSignIn={true}
 *       customNavigate={(url) => navigate(url)}
 *     >
 *       {children}
 *     </AuthProvider>
 *   )
 * }
 *
 * @throws {Error} If required Logto configuration is missing or invalid (endpoint, appId)
 */
// External provider that wraps Logto's provider
export const AuthProvider = ({ children, config, callbackUrl, customNavigate, enablePopupSignIn = false }: AuthProviderProps) => {
  // Validate configuration on mount
  useEffect(() => {
    validateLogtoConfig(config)
  }, [config])

  // Set the custom navigate function for the entire library
  useEffect(() => {
    setCustomNavigate(customNavigate || null)

    // Cleanup on unmount
    return () => setCustomNavigate(null)
  }, [customNavigate])

  return (
    <ClientOnly>
      <LogtoProvider config={config}>
        <InternalAuthProvider logtoConfig={config} callbackUrl={callbackUrl} enablePopupSignIn={enablePopupSignIn}>
          {children}
        </InternalAuthProvider>
      </LogtoProvider>
    </ClientOnly>
  )
}

/**
 * useAuthContext Hook (Internal)
 *
 * Internal hook to access the authentication context. Not exported directly.
 * Use the exported {@link useAuth} hook instead for the public API.
 *
 * @internal
 * @returns {AuthContextType} Authentication context with user, loading state, and auth functions
 * @throws {Error} If used outside of AuthProvider context
 *
 * @see {@link useAuth} for the public API to access auth context
 */
// Hook to use the auth context
export const useAuthContext = (): AuthContextType => {
  const context = useContext(AuthContext)

  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider')
  }

  return context
}
