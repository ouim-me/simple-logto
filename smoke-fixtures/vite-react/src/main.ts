import React from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider, CallbackPage, SignInButton, SignInPage, UserCenter, useAuth } from '@ouim/simple-logto'
import type { AuthProviderProps, CallbackPageProps, LogtoUser, SignInPageProps } from '@ouim/simple-logto'

const logtoConfig: AuthProviderProps['config'] = {
  endpoint: 'https://example.logto.app',
  appId: 'demo-app-id',
  resources: ['https://api.example.com'],
}

const signInPageProps: SignInPageProps = {
  className: 'signin-shell',
  loadingComponent: React.createElement('div', null, 'Redirecting to Logto...'),
}

const callbackProps: CallbackPageProps = {
  redirectTo: '/dashboard',
  loadingComponent: React.createElement('div', null, 'Completing callback...'),
}

const fallbackUser: LogtoUser = { id: 'guest-user' }
const authProviderProps: AuthProviderProps = {
  config: logtoConfig,
  callbackUrl: 'http://localhost:5173/callback',
  enablePopupSignIn: true,
  children: React.createElement(
    React.Fragment,
    null,
    React.createElement(DemoApp, null),
    React.createElement(CallbackPage, callbackProps),
    React.createElement(SignInPage, signInPageProps),
  ),
}

function DemoApp() {
  const auth = useAuth()
  const label = auth.user?.name ?? fallbackUser.id

  return React.createElement(
    'main',
    null,
    React.createElement('h1', null, label),
    React.createElement(SignInButton, null),
    React.createElement(UserCenter, {
      additionalPages: [{ link: '/settings', text: 'Settings' }],
    }),
  )
}

createRoot(document.getElementById('app')!).render(React.createElement(AuthProvider, authProviderProps))
