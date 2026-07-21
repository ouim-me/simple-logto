'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useHandleSignInCallback } from '@logto/react'
import { FLOW_STORAGE_KEY, parseStoredFlow, POPUP_COMPLETE_STORAGE_KEY, safeReturnPath } from './flow.js'
import type { CallbackPageProps } from './types.js'

const spinKeyframes = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`

/** Completes the OAuth code exchange for compatible redirect and correlated popup flows. */
export function CallbackPage({ className = '', loadingComponent, successComponent, onSuccess, onError, redirectTo = '/' }: CallbackPageProps) {
  const callbackHandled = useRef(false)
  const flow = useMemo(
    () => parseStoredFlow(typeof window === 'undefined' ? null : window.sessionStorage.getItem(FLOW_STORAGE_KEY)),
    [],
  )

  useEffect(() => {
    if (!document.querySelector('#spin-keyframes')) {
      const style = document.createElement('style')
      style.id = 'spin-keyframes'
      style.textContent = spinKeyframes
      document.head.appendChild(style)
    }
  }, [])

  const state = useHandleSignInCallback(() => {
    if (callbackHandled.current) return
    callbackHandled.current = true
    try {
      onSuccess?.()
      window.sessionStorage.removeItem(FLOW_STORAGE_KEY)

      if (flow?.popup) {
        const message = { type: 'AUTHKIT_AUTH_COMPLETE', flowId: flow.id } as const
        window.localStorage.setItem(POPUP_COMPLETE_STORAGE_KEY, JSON.stringify(message))
        if (window.opener && window.opener !== window) {
          try {
            window.opener.postMessage(message, window.location.origin)
          } catch {
            // localStorage is the cross-tab fallback when the opener is unavailable.
          }
        }
        setTimeout(() => window.close(), 100)
        return
      }

      const isLegacyPopup =
        (window.opener && window.opener !== window) || sessionStorage.getItem('simple_logto_popup_flow') === 'true'
      if (!isLegacyPopup) {
        window.location.href = flow?.returnTo ?? safeReturnPath(redirectTo)
        return
      }

      sessionStorage.removeItem('simple_logto_popup_flow')
      if (window.opener && window.opener !== window) {
        try {
          window.opener.postMessage({ type: 'SIGNIN_SUCCESS' }, window.location.origin)
        } catch {
          localStorage.setItem('simple_logto_signin_complete', Date.now().toString())
        }
      } else {
        localStorage.setItem('simple_logto_signin_complete', Date.now().toString())
      }
      setTimeout(() => window.close(), 100)
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)))
    }
  })

  useEffect(() => {
    if (!state.error) return
    onError?.(state.error)
    if (flow?.popup && window.opener && window.opener !== window) {
      try {
        window.opener.postMessage({ type: 'AUTHKIT_AUTH_ERROR', flowId: flow.id }, window.location.origin)
      } catch {
        // The popup remains open with the error state when its opener is gone.
      }
    }
  }, [flow, onError, state.error])

  const containerStyle = { display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '500', minHeight: '100vh' }
  const flexStyle = { display: 'flex', alignItems: 'center', gap: '0.5rem' }
  const spinnerStyle = { width: '1.25rem', height: '1.25rem', color: 'black', animation: 'spin 1s linear infinite' }
  const textStyle = { fontSize: '1.125rem', color: '#64748b' }

  if (state.error) {
    return <div style={containerStyle} className={className} role="alert">{state.error.message}</div>
  }

  if (state.isLoading) {
    return (
      <div style={containerStyle} className={className}>
        {loadingComponent ?? <div style={flexStyle}><svg style={spinnerStyle} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle style={{ opacity: .25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path style={{ opacity: .75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg><div style={textStyle}>Signing you in...</div></div>}
      </div>
    )
  }

  return (
    <div style={containerStyle} className={className}>
      {successComponent ?? <div style={{ ...flexStyle, textAlign: 'center' as const }}><svg style={spinnerStyle} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle style={{ opacity: .25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path style={{ opacity: .75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg><div style={textStyle}>Authentication complete! Redirecting...</div></div>}
    </div>
  )
}
