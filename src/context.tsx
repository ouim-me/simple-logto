'use client'
import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { LogtoConfig, LogtoProvider, useLogto } from '@logto/react'
import { transformUser, jwtCookieUtils, guestUtils, validateLogtoConfig } from './utils.js'
import { NavigationProvider } from './navigation.js'
import type {
  AuthContextType,
  AuthErrorEvent,
  AuthProviderProps,
  AuthSignOutEvent,
  AuthSignOutReason,
  AuthTokenRefreshEvent,
  LogtoUser,
} from './types.js'

const POPUP_AUTH_EVENT_DELAY = 500
const POPUP_AUTH_RETRY_INTERVAL_MS = 250
const POPUP_AUTH_MAX_RETRY_ATTEMPTS = 20
const LOCAL_SIGN_OUT_STORAGE_KEY = 'simple_logto_local_signout'
const TOKEN_REFRESH_BUFFER_MS = 60_000
const MIN_TOKEN_REFRESH_DELAY_MS = 1_000
const TOKEN_REFRESH_RETRY_MS = 15_000

const decodeBase64Url = (value: string): string | null => {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')

    if (typeof atob === 'function') {
      return atob(padded)
    }

    if (typeof Buffer !== 'undefined') {
      return Buffer.from(padded, 'base64').toString('utf8')
    }
  } catch {
    return null
  }

  return null
}

const getJwtExpiration = (token: string): number | undefined => {
  const payload = token.split('.')[1]
  if (!payload) return undefined

  const decodedPayload = decodeBase64Url(payload)
  if (!decodedPayload) return undefined

  try {
    const parsed = JSON.parse(decodedPayload) as { exp?: unknown }
    return typeof parsed.exp === 'number' ? parsed.exp : undefined
  } catch {
    return undefined
  }
}

const toError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)))

const getLocalSignOutOverride = (): boolean => {
  if (typeof window === 'undefined') {
    return false
  }

  return window.sessionStorage.getItem(LOCAL_SIGN_OUT_STORAGE_KEY) === 'true'
}

const setLocalSignOutOverride = (active: boolean): void => {
  if (typeof window === 'undefined') {
    return
  }

  if (active) {
    window.sessionStorage.setItem(LOCAL_SIGN_OUT_STORAGE_KEY, 'true')
  } else {
    window.sessionStorage.removeItem(LOCAL_SIGN_OUT_STORAGE_KEY)
  }
}

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
 * - POPUP_AUTH_EVENT_DELAY (500ms) allows Logto's React SDK to sync its internal state
 *   from shared localStorage before we attempt to read claims. Without this delay,
 *   getIdTokenClaims() / getAccessToken() may still see the pre-auth (empty) state.
 * - Three signal sources all use forceRefresh: postMessage, localStorage, popup closure
 *
 * WHY NO window.location.reload():
 * - A reload navigates the page, discarding any in-flight async work (including the
 *   loadUser(true) call made on the same tick). It is a blunt instrument that forces
 *   the Logto SDK to re-initialise from scratch, but it also resets all other app state.
 * - The POPUP_AUTH_EVENT_DELAY + forceRefresh approach is sufficient: by the time
 *   loadUser executes, Logto has read the new tokens from shared localStorage and
 *   isAuthenticated transitions to true, allowing claims to be fetched normally.
 * - If a reload were ever truly required (e.g. a bundler or framework caches modules
 *   across navigations in a way that prevents Logto re-init), it should be done only
 *   AFTER loadUser resolves and confirms the user is still null, not unconditionally.
 *
 * SIGNAL FLOW:
 * postMessage (primary)  → setTimeout(500ms) → loadUser(true) → fetch claims → update user
 * localStorage (fallback) → setTimeout(500ms) → loadUser(true) → fetch claims → update user
 * popup?.closed (fallback) → setTimeout(500ms) → loadUser(true) → fetch claims → update user
 */

// Internal provider that wraps Logto's context
const InternalAuthProvider = ({
  children,
  callbackUrl,
  enablePopupSignIn,
  logtoConfig,
  onTokenRefresh,
  onAuthError,
  onSignOut,
}: {
  children: React.ReactNode
  callbackUrl?: string
  enablePopupSignIn?: boolean
  logtoConfig: LogtoConfig // Logto configuration object
  onTokenRefresh?: (event: AuthTokenRefreshEvent) => void
  onAuthError?: (event: AuthErrorEvent) => void
  onSignOut?: (event: AuthSignOutEvent) => void
}) => {
  const { isAuthenticated, isLoading, getIdTokenClaims, getAccessToken, signIn: logtoSignIn, signOut: logtoSignOut } = useLogto()
  const [user, setUser] = useState<LogtoUser | null>(null)
  const [isLoadingUser, setIsLoadingUser] = useState<boolean>(true)
  const defaultResource = logtoConfig?.resources?.[0] || 'urn:logto:resource:default'

  // Rate limiting to prevent infinite calls
  const lastLoadTime = useRef<number>(0)
  /** Counts confirmed auth errors (4xx / token-invalid responses) that should trigger sign-out. */
  const errorCount = useRef<number>(0)
  /**
   * Counts consecutive transient errors (network failures, 5xx, timeouts).
   * These should NOT sign the user out — the session may likely still be valid.
   * Reset to 0 on any successful token fetch or on a confirmed auth error path.
   */
  const transientErrorCount = useRef<number>(0)
  /** Pending exponential-backoff retry timer; cleared on successful load or unmount. */
  const backoffTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>()
  /** Pending proactive token refresh timer; cleared whenever auth state changes. */
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>()
  /** Prevents overlapping timer-driven refresh attempts. */
  const refreshInFlightRef = useRef<boolean>(false)
  /** Tracks the last access-token expiry used for scheduling to avoid tight loops when exp does not advance. */
  const lastScheduledTokenExpRef = useRef<number | undefined>()
  /** Set to true in the unmount cleanup; guards async callbacks against firing on dead component. */
  const isUnmountedRef = useRef<boolean>(false)
  /** Tracks the popup-closed polling interval so it can be cleared on provider unmount. */
  const popupIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>()
  /** Tracks the 5-minute popup auto-cleanup timer so it can be cleared on provider unmount. */
  const popupCleanupTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>()
  /** Retries popup auth rehydration while the parent SDK instance catches up with shared storage. */
  const popupAuthRetryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>()
  /** Marks that a popup completion signal was received and auth state is expected to rehydrate shortly. */
  const popupAuthPendingRef = useRef<boolean>(false)
  /** Counts popup auth rehydration retries so we can stop polling if the SDK never catches up. */
  const popupAuthRetryCountRef = useRef<number>(0)
  /** Keeps app-local sign-out isolated from the tenant-wide Logto session. */
  const localSignOutRef = useRef<boolean>(getLocalSignOutOverride())
  /** Tracks the last access token so refresh callbacks only fire for real token transitions. */
  const lastAccessTokenRef = useRef<string | undefined>()
  /** Tracks the last access token expiry used in refresh callback payloads. */
  const lastAccessTokenExpRef = useRef<number | undefined>()
  /** Latest lifecycle callbacks without forcing auth logic to re-subscribe on every render. */
  const onTokenRefreshRef = useRef(onTokenRefresh)
  const onAuthErrorRef = useRef(onAuthError)
  const onSignOutRef = useRef(onSignOut)
  const MAX_ERROR_COUNT = 3
  /**
   * Maximum consecutive transient errors before giving up and signing the user out.
   * With exponential backoff (1 s, 2 s, 4 s, 8 s, 16 s) total wait ≈ 31 s before
   * the user sees an error state and is signed out.
   */
  const MAX_TRANSIENT_ERRORS = 5
  const MIN_LOAD_INTERVAL = 1000 // 1 second between calls

  useEffect(() => {
    onTokenRefreshRef.current = onTokenRefresh
  }, [onTokenRefresh])

  useEffect(() => {
    onAuthErrorRef.current = onAuthError
  }, [onAuthError])

  useEffect(() => {
    onSignOutRef.current = onSignOut
  }, [onSignOut])

  const emitAuthError = useCallback((event: AuthErrorEvent) => {
    try {
      onAuthErrorRef.current?.(event)
    } catch (callbackError) {
      console.error('Error in AuthProvider onAuthError callback:', callbackError)
    }
  }, [])

  const emitSignOut = useCallback((event: AuthSignOutEvent) => {
    try {
      onSignOutRef.current?.(event)
    } catch (callbackError) {
      console.error('Error in AuthProvider onSignOut callback:', callbackError)
    }
  }, [])

  const emitTokenRefresh = useCallback((event: AuthTokenRefreshEvent) => {
    try {
      onTokenRefreshRef.current?.(event)
    } catch (callbackError) {
      console.error('Error in AuthProvider onTokenRefresh callback:', callbackError)
    }
  }, [])

  const clearTrackedAccessToken = useCallback(() => {
    lastAccessTokenRef.current = undefined
    lastAccessTokenExpRef.current = undefined
  }, [])

  const performGlobalSignOut = useCallback(
    async (reason: AuthSignOutReason, error?: Error, nextCallbackUrl?: string) => {
      emitSignOut({
        reason,
        global: true,
        callbackUrl: nextCallbackUrl,
        error,
      })
      await logtoSignOut(nextCallbackUrl)
    },
    [emitSignOut, logtoSignOut],
  )

  const clearRefreshTimer = useCallback(() => {
    clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = undefined
  }, [])

  const resetRefreshSchedule = useCallback(() => {
    clearRefreshTimer()
    lastScheduledTokenExpRef.current = undefined
  }, [clearRefreshTimer])

  const clearPopupAuthRetry = useCallback(() => {
    clearTimeout(popupAuthRetryTimerRef.current)
    popupAuthRetryTimerRef.current = undefined
    popupAuthPendingRef.current = false
    popupAuthRetryCountRef.current = 0
  }, [])

  const setLocalSignOutState = useCallback((active: boolean) => {
    localSignOutRef.current = active
    setLocalSignOutOverride(active)
  }, [])

  const queuePopupAuthRefresh = useCallback((delayMs = POPUP_AUTH_EVENT_DELAY) => {
    popupAuthPendingRef.current = true
    popupAuthRetryCountRef.current = 0
    clearTimeout(popupAuthRetryTimerRef.current)
    popupAuthRetryTimerRef.current = setTimeout(() => {
      if (!isUnmountedRef.current) {
        void loadUserRef.current(true)
      }
    }, delayMs)
  }, [])

  const scheduleTokenRefresh = useCallback(
    (exp?: number) => {
      clearRefreshTimer()

      if (!isAuthenticated || exp === undefined) {
        return
      }

      const previousExp = lastScheduledTokenExpRef.current
      const expiresAtMs = exp * 1000
      const timeUntilExpiry = expiresAtMs - Date.now()
      const isUnchangedOrOlderExp = previousExp !== undefined && exp <= previousExp
      let refreshDelay = timeUntilExpiry - TOKEN_REFRESH_BUFFER_MS

      if (isUnchangedOrOlderExp && refreshDelay <= MIN_TOKEN_REFRESH_DELAY_MS) {
        // If the SDK gave us the same access-token expiry again, avoid re-entering the
        // refresh path every second. Retry on a slower cadence while the token is still valid.
        refreshDelay = Math.min(Math.max(timeUntilExpiry, MIN_TOKEN_REFRESH_DELAY_MS), TOKEN_REFRESH_RETRY_MS)
      } else {
        refreshDelay = Math.max(refreshDelay, MIN_TOKEN_REFRESH_DELAY_MS)
      }

      lastScheduledTokenExpRef.current = exp

      refreshTimerRef.current = setTimeout(() => {
        if (isUnmountedRef.current || refreshInFlightRef.current) {
          return
        }

        refreshInFlightRef.current = true

        void loadUserRef.current(true).finally(() => {
          refreshInFlightRef.current = false
        })
      }, refreshDelay)
    },
    [clearRefreshTimer, isAuthenticated],
  )

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
        if (localSignOutRef.current) {
          setUser(null)
          jwtCookieUtils.removeToken()
          clearTrackedAccessToken()
          errorCount.current = 0
          transientErrorCount.current = 0
          clearTimeout(backoffTimerRef.current)
          resetRefreshSchedule()
          setIsLoadingUser(false)
          return
        }

        try {
          const claims = await getIdTokenClaims()
          const jwt = await getAccessToken(defaultResource)

          if (jwt) {
            clearPopupAuthRetry()
            const nextUser = transformUser(claims)
            // Only set user as logged in if we actually have a valid access token
            const tokenExp = getJwtExpiration(jwt)
            const previousToken = lastAccessTokenRef.current
            const previousExpiresAt = lastAccessTokenExpRef.current
            jwtCookieUtils.saveToken(jwt)
            setUser(nextUser)
            // Reset all error counters and any pending backoff on a successful fetch
            errorCount.current = 0
            transientErrorCount.current = 0
            clearTimeout(backoffTimerRef.current)
            lastAccessTokenRef.current = jwt
            lastAccessTokenExpRef.current = tokenExp
            if (previousToken !== undefined && previousToken !== jwt && nextUser) {
              emitTokenRefresh({
                user: nextUser,
                accessToken: jwt,
                expiresAt: tokenExp,
                previousExpiresAt,
              })
            }
            scheduleTokenRefresh(tokenExp)
          } else {
            // Refresh token expired (e.g. user was gone > 30 days) — session is dead.
            // The Logto SDK still reports isAuthenticated=true because it reads stale
            // localStorage, but we have no usable token, so we must log out cleanly.
            const authError = new Error('Access token unavailable — session likely expired. Forcing logout.')
            console.warn(authError.message)
            emitAuthError({
              error: authError,
              isTransient: false,
              willSignOut: true,
            })
            setUser(null)
            jwtCookieUtils.removeToken()
            resetRefreshSchedule()
            clearTrackedAccessToken()
            await performGlobalSignOut('missing_access_token', authError)
          }
        } catch (error: unknown) {
          console.error('Error fetching user claims:', error)
          const normalizedError = toError(error)

          // ─── Classify the error ──────────────────────────────────────────────
          //
          // Transient errors (network failures, server overload, timeouts) should
          // NOT sign the user out. Their session is likely still valid; we should
          // retry with exponential backoff instead.
          //
          // Auth errors (invalid/expired tokens, revoked grants) indicate the
          // session is genuinely broken and we must sign the user out.
          const errorMessage = normalizedError.message.toLowerCase()
          const errorCode = typeof error === 'object' && error !== null && 'code' in error ? (error as { code: unknown }).code : undefined

          // Auth errors are evaluated FIRST because they must take priority:
          // an error message that contains both an auth keyword ("invalid") and a
          // network keyword ("network timeout") must be treated as an auth error to
          // ensure the user is correctly signed out rather than silently retried.
          const isDefiniteAuthError =
            // Specific Logto / OAuth error messages
            errorMessage.includes('invalid') ||
            errorMessage.includes('expired') ||
            errorMessage.includes('grant request is invalid') ||
            // OAuth error code from the token endpoint
            errorCode === 'invalid_grant'

          // A transient error is one that looks like a network/infrastructure failure
          // AND is NOT also a definite auth error (the auth keyword takes precedence).
          const isTransientError =
            !isDefiniteAuthError && // Network-level failures (no response from server)
            ((error instanceof TypeError && (errorMessage.includes('fetch') || errorMessage.includes('network'))) ||
              // Explicit network/timeout strings that various runtimes may use
              errorMessage.includes('networkerror') ||
              errorMessage.includes('network error') ||
              errorMessage.includes('timeout') ||
              errorMessage.includes('econnrefused') ||
              errorMessage.includes('enotfound') ||
              // HTTP 5xx responses surfaced as errors by the Logto SDK
              errorMessage.includes('500') ||
              errorMessage.includes('502') ||
              errorMessage.includes('503') ||
              errorMessage.includes('504'))

          // ─── Transient error path ────────────────────────────────────────────
          if (isTransientError) {
            transientErrorCount.current += 1
            const willSignOut = transientErrorCount.current > MAX_TRANSIENT_ERRORS
            emitAuthError({
              error: normalizedError,
              isTransient: true,
              willSignOut,
            })
            // Preserve the current user state — the user is likely still authenticated.
            // Schedule an exponential-backoff retry (capped at 32 s) so that a
            // temporary outage self-heals without manual intervention.
            const backoffMs = Math.min(1000 * Math.pow(2, transientErrorCount.current - 1), 32000)
            console.warn(
              `Transient auth error (attempt ${transientErrorCount.current}/${MAX_TRANSIENT_ERRORS}). ` + `Retrying in ${backoffMs}ms:`,
              error instanceof Error ? error.message : error,
            )
            if (transientErrorCount.current <= MAX_TRANSIENT_ERRORS) {
              // Clear any previously scheduled retry before scheduling a new one
              clearTimeout(backoffTimerRef.current)
              backoffTimerRef.current = setTimeout(() => {
                // Guard against the component having unmounted during the backoff window
                if (!isUnmountedRef.current) {
                  loadUserRef.current(true)
                }
              }, backoffMs)
            } else {
              // All retries exhausted — the network failure is sustained long enough that
              // we can no longer guarantee the session is still valid. Sign the user out
              // cleanly so the UI reaches a known, non-ambiguous state.
              console.warn('Max transient error retries exceeded. Signing out to reset to a clean state.')
              setUser(null)
              jwtCookieUtils.removeToken()
              transientErrorCount.current = 0
              resetRefreshSchedule()
              clearTrackedAccessToken()
              try {
                await performGlobalSignOut('transient_error_limit', normalizedError)
              } catch (logoutError) {
                console.error('Error during forced logout after transient retry exhaustion:', logoutError)
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('auth-state-changed'))
                }
              }
            }
          } else {
            // ─── Auth error path ─────────────────────────────────────────────────
            // The session is genuinely invalid. Clear local state and sign out.
            clearTimeout(backoffTimerRef.current)
            setUser(null)
            jwtCookieUtils.removeToken()
            resetRefreshSchedule()
            errorCount.current += 1
            transientErrorCount.current = 0

            const shouldSignOut = isDefiniteAuthError || errorCount.current >= MAX_ERROR_COUNT
            emitAuthError({
              error: normalizedError,
              isTransient: false,
              willSignOut: shouldSignOut,
            })

            if (shouldSignOut) {
              console.warn('Authentication error detected, forcing logout:', normalizedError.message)
              clearTrackedAccessToken()
              try {
                await performGlobalSignOut('auth_error', normalizedError)
              } catch (logoutError) {
                console.error('Error during forced logout:', logoutError)
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('auth-state-changed'))
                }
              }
              errorCount.current = 0
            }
          }
        }
      } else {
        if (localSignOutRef.current) {
          setLocalSignOutState(false)
        }

        if (forceRefresh && popupAuthPendingRef.current) {
          if (popupAuthRetryCountRef.current < POPUP_AUTH_MAX_RETRY_ATTEMPTS) {
            popupAuthRetryCountRef.current += 1
            popupAuthRetryTimerRef.current = setTimeout(() => {
              if (!isUnmountedRef.current) {
                void loadUserRef.current(true)
              }
            }, POPUP_AUTH_RETRY_INTERVAL_MS)
            // Keep the existing signed-in state intact while the parent SDK instance
            // rehydrates from the tokens written by the popup flow.
            setIsLoadingUser(false)
            return
          }

          clearPopupAuthRetry()
        }

        setUser(null)
        // Remove token cookie when not authenticated
        jwtCookieUtils.removeToken()
        clearTrackedAccessToken()
        // Reset all error counts when transitioning to unauthenticated state
        errorCount.current = 0
        transientErrorCount.current = 0
        clearTimeout(backoffTimerRef.current)
        resetRefreshSchedule()
      }

      setIsLoadingUser(false)
    },
    [
      clearPopupAuthRetry,
      clearTrackedAccessToken,
      defaultResource,
      emitAuthError,
      emitTokenRefresh,
      getAccessToken,
      getIdTokenClaims,
      isAuthenticated,
      isLoading,
      performGlobalSignOut,
      resetRefreshSchedule,
      scheduleTokenRefresh,
      setLocalSignOutState,
    ],
  )

  useEffect(() => {
    loadUser()
  }, [loadUser])

  // Clean up all async resources when this provider unmounts
  useEffect(() => {
    return () => {
      // Mark as unmounted so any in-flight backoff callbacks do not call loadUser
      // on a dead component tree (guards against the timer/unmount race condition).
      isUnmountedRef.current = true
      clearTimeout(backoffTimerRef.current)
      resetRefreshSchedule()
      // Clean up popup polling interval and 5-minute auto-cleanup timer in case
      // the provider is unmounted while a popup sign-in is still in progress.
      clearInterval(popupIntervalRef.current)
      clearTimeout(popupCleanupTimerRef.current)
      clearTimeout(popupAuthRetryTimerRef.current)
    }
  }, [resetRefreshSchedule])

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
        // POPUP_AUTH_EVENT_DELAY gives Logto's SDK time to sync its internal state from
        // the new tokens that the popup stored in shared localStorage before we try to
        // read claims. forceRefresh bypasses rate-limiting and the isLoading early-return.
        setTimeout(() => {
          queuePopupAuthRefresh()
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
  }, [queuePopupAuthRefresh]) // Stable callback dependency keeps the listeners current without re-subscribing on every render.

  const signIn = useCallback(
    async (overrideCallbackUrl?: string, usePopup?: boolean) => {
      // Only run on client side
      if (typeof window === 'undefined') return

      setLocalSignOutState(false)

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

        // Declared before handleMessage so the closure can reference it once assigned.
        // Also tracked in a ref so the provider's unmount cleanup can clear it.
        // eslint-disable-next-line prefer-const -- two-phase: declared here for closure, assigned after handleMessage is defined
        let cleanupTimeoutId: ReturnType<typeof setTimeout> | undefined

        // Listen for the popup to close or complete authentication.
        // The interval ID is stored in a ref so it survives provider unmount.
        const checkClosed = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkClosed)
            popupIntervalRef.current = undefined
            // Popup closed - delay allows Logto SDK to sync from shared localStorage
            // before we attempt to read claims with forceRefresh=true.
            setTimeout(() => {
              if (!isUnmountedRef.current) {
                queuePopupAuthRefresh(0)
                window.dispatchEvent(new CustomEvent('auth-state-changed'))
              }
            }, POPUP_AUTH_EVENT_DELAY)
          }
        }, 1000)
        popupIntervalRef.current = checkClosed

        // Listen for messages from the popup.
        // Guard against two distinct spoofing vectors:
        //   1. Cross-origin messages — rejected by the origin check.
        //   2. Same-origin script spoofing — a script on the same origin could
        //      dispatch a synthetic MessageEvent with `type: 'SIGNIN_SUCCESS'` and
        //      pass the origin check. Adding `event.source === popup` ensures we
        //      only accept the message from the exact popup window we opened.
        const handleMessage = (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return
          if (event.source !== popup) return

          if (event.data.type === 'SIGNIN_SUCCESS' || event.data.type === 'SIGNIN_COMPLETE') {
            // Cancel the 5-minute stale cleanup and remove all listeners immediately
            clearTimeout(cleanupTimeoutId)
            popupCleanupTimerRef.current = undefined
            window.removeEventListener('message', handleMessage)
            clearInterval(checkClosed)
            popupIntervalRef.current = undefined
            popup.close()
            // Delay lets Logto's internal state sync from the tokens the popup wrote to
            // shared localStorage before we read claims with forceRefresh=true.
            setTimeout(() => {
              if (!isUnmountedRef.current) {
                queuePopupAuthRefresh(0)
                window.dispatchEvent(new CustomEvent('auth-state-changed'))
              }
            }, POPUP_AUTH_EVENT_DELAY)
          }
        }

        window.addEventListener('message', handleMessage)

        // Cleanup listener and poll interval (called on 5-minute timeout)
        const cleanupListener = () => {
          window.removeEventListener('message', handleMessage)
          clearInterval(checkClosed)
        }

        // Auto-cleanup after 5 minutes if popup neither completes nor closes.
        // Stored in both the local variable (for the handleMessage closure) and
        // the ref (so provider unmount can cancel it).
        cleanupTimeoutId = setTimeout(cleanupListener, 300000)
        popupCleanupTimerRef.current = cleanupTimeoutId
      }
    },
    [enablePopupSignIn, callbackUrl, logtoSignIn, queuePopupAuthRefresh, setLocalSignOutState],
  )

  const signOut = useCallback(
    async (options?: { callbackUrl?: string; global?: boolean }) => {
      // Only run on client side
      if (typeof window === 'undefined') return

      const { callbackUrl, global = true } = options || {}

      // Always remove the JWT token cookie on sign out
      jwtCookieUtils.removeToken()
      resetRefreshSchedule()
      clearTrackedAccessToken()
      clearPopupAuthRetry()
      emitSignOut({
        reason: 'user',
        global,
        callbackUrl,
      })

      if (global) {
        setLocalSignOutState(false)
        // Global sign out - logs out from entire Logto ecosystem
        await logtoSignOut(callbackUrl)
      } else {
        // Local sign out - only clears local session
        setLocalSignOutState(true)
        clearTimeout(backoffTimerRef.current)
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
    [clearPopupAuthRetry, clearTrackedAccessToken, emitSignOut, logtoSignOut, resetRefreshSchedule, setLocalSignOutState],
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
 * @param {(event: AuthTokenRefreshEvent) => void} [onTokenRefresh] - Called when an existing authenticated session receives a different access token
 * @param {(event: AuthErrorEvent) => void} [onAuthError] - Called when auth loading hits a transient or definitive auth error
 * @param {(event: AuthSignOutEvent) => void} [onSignOut] - Called immediately before the provider initiates local or global sign-out
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
export const AuthProvider = ({
  children,
  config,
  callbackUrl,
  customNavigate,
  enablePopupSignIn = false,
  onTokenRefresh,
  onAuthError,
  onSignOut,
}: AuthProviderProps) => {
  // Validate configuration on mount; also emit developer-friendly warnings in non-production
  // builds so misconfiguration is caught early with actionable messages and doc links.
  useEffect(() => {
    // Guard `process` access so browser builds without a Node-style global do not throw.
    // In most bundlers this still gets inlined at build time when available.
    const env = typeof process !== 'undefined' ? process.env?.NODE_ENV : undefined
    if (env !== 'production') {
      if (!config?.appId) {
        console.warn(
          '[simple-logto] AuthProvider: `appId` is missing or empty.\n' +
            'Every Logto application needs an App ID from the Logto Console.\n' +
            'Docs: https://docs.logto.io/quick-starts',
        )
      }
      if (!config?.endpoint) {
        console.warn(
          '[simple-logto] AuthProvider: `endpoint` (your Logto tenant URL) is missing or empty.\n' +
            'Example: "https://your-tenant.logto.app"\n' +
            'Docs: https://docs.logto.io/quick-starts',
        )
      }
      if (!config?.resources?.length) {
        console.warn(
          '[simple-logto] AuthProvider: No `resources` (API identifiers) are configured.\n' +
            'Backend JWT verification requires at least one API resource.\n' +
            'Docs: https://docs.logto.io/docs/recipes/configure-jwt-token',
        )
      }
    }
    validateLogtoConfig(config, { warnOnMissingResources: false })
  }, [config])

  return (
    <ClientOnly>
      <LogtoProvider config={config}>
        <NavigationProvider customNavigate={customNavigate}>
          <InternalAuthProvider
            logtoConfig={config}
            callbackUrl={callbackUrl}
            enablePopupSignIn={enablePopupSignIn}
            onTokenRefresh={onTokenRefresh}
            onAuthError={onAuthError}
            onSignOut={onSignOut}
          >
            {children}
          </InternalAuthProvider>
        </NavigationProvider>
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
