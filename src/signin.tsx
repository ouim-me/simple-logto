'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './useAuth.js'
import { createFlowId, safeReturnPath, type StoredAuthFlow } from './flow.js'
import LoadingSpinner from './components/ui/loading-spinner.js'
import type { AuthContextType, SessionPolicy, SignInPageProps, SignInStrategy } from './types.js'

const strategyFrom = (value: string | null): SignInStrategy | undefined =>
  value === 'google' || value === 'github' || value === 'email' ? value : undefined

const policyFrom = (value: string | null): SessionPolicy =>
  value === 'automatic' || value === 'reauthenticate' ? value : 'explicit'

type InternalFlowAuth = AuthContextType & {
  beginCurrentWindow?: (flow: StoredAuthFlow, callbackUrl?: string) => Promise<void>
}

/** Route component that starts either the compatible hosted flow or a correlated provider flow. */
export function SignInPage({ className = '', loadingComponent, errorComponent }: SignInPageProps) {
  const auth = useAuth() as InternalFlowAuth
  const { user, signIn, isLoadingUser } = auth
  const signInInProgress = useRef(false)
  const [signInError, setSignInError] = useState<Error | null>(null)
  const enhancedFlow = useMemo<StoredAuthFlow | undefined>(() => {
    const params = new URLSearchParams(window.location.search)
    if (!params.get('authkit_flow')) return undefined
    return {
      id: params.get('authkit_flow') ?? createFlowId(),
      popup: params.get('popup') === 'true' || Boolean(window.opener),
      returnTo: safeReturnPath(params.get('return_to')),
      strategy: strategyFrom(params.get('strategy')),
      sessionPolicy: policyFrom(params.get('policy')),
    }
  }, [])

  useEffect(() => {
    if (isLoadingUser || signInInProgress.current) return
    signInInProgress.current = true
    setSignInError(null)

    if (enhancedFlow && auth.beginCurrentWindow) {
      void auth.beginCurrentWindow(enhancedFlow).catch((error: unknown) => {
        signInInProgress.current = false
        setSignInError(error instanceof Error ? error : new Error('Failed to start sign-in'))
      })
      return
    }

    const searchParams = new URLSearchParams(window.location.search)
    if (searchParams.get('popup') === 'true') sessionStorage.setItem('simple_logto_popup_flow', 'true')
    const isPopup =
      (window.opener && window.opener !== window) || sessionStorage.getItem('simple_logto_popup_flow') === 'true'

    if (user) {
      if (isPopup) {
        if (window.opener && window.opener !== window) {
          try {
            window.opener.postMessage({ type: 'SIGNIN_COMPLETE' }, window.location.origin)
          } catch {
            localStorage.setItem('simple_logto_signin_complete', Date.now().toString())
          }
        } else {
          localStorage.setItem('simple_logto_signin_complete', Date.now().toString())
        }
        sessionStorage.removeItem('simple_logto_popup_flow')
        setTimeout(() => window.close(), 100)
      } else if (window.location.pathname !== '/') {
        window.location.href = '/'
      }
      return
    }

    void signIn(undefined, false).catch((error: unknown) => {
      signInInProgress.current = false
      setSignInError(error instanceof Error ? error : new Error('Failed to start sign-in'))
    })
  }, [auth, enhancedFlow, isLoadingUser, signIn, user])

  if (signInError) {
    return (
      <div className={`flex min-h-screen items-center justify-center ${className}`.trim()}>
        {typeof errorComponent === 'function'
          ? errorComponent(signInError)
          : (errorComponent ?? <div role="alert">Failed to start sign-in. Please try again.</div>)}
      </div>
    )
  }

  if (isLoadingUser) {
    return <div className={`flex min-h-screen items-center justify-center ${className}`.trim()}>{loadingComponent ?? <LoadingSpinner />}</div>
  }

  return null
}
