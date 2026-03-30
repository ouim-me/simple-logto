import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { AuthProvider, CallbackPage, SignInPage, useAuth } from '@ouim/simple-logto'
import type { AuthProviderProps } from '@ouim/simple-logto'

const logtoConfig: AuthProviderProps['config'] = {
  endpoint: 'https://example.logto.app',
  appId: 'react-router-smoke-app',
  resources: ['https://api.example.com'],
}

function Dashboard() {
  const { user } = useAuth({ middleware: 'auth', redirectTo: '/signin' })

  return React.createElement('main', null, React.createElement('h1', null, user?.name ?? 'Dashboard'))
}

function AuthShell() {
  const navigate = useNavigate()

  return (
    <AuthProvider
      config={logtoConfig}
      callbackUrl={`${window.location.origin}/callback`}
      customNavigate={url => navigate(url)}
      enablePopupSignIn
    >
      <Routes>
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/callback" element={<CallbackPage redirectTo="/" />} />
        <Route path="/" element={<Dashboard />} />
      </Routes>
    </AuthProvider>
  )
}

createRoot(document.getElementById('app')!).render(
  <BrowserRouter>
    <AuthShell />
  </BrowserRouter>,
)
