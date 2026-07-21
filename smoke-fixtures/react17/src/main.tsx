import React from 'react'
import ReactDOM from 'react-dom'
import { AuthProvider, SignInDialog } from '@ouim/logto-authkit'
import '@ouim/logto-authkit/styles.css'

// React 17 intentionally uses the legacy renderer in this compatibility fixture.
// eslint-disable-next-line react/no-deprecated
ReactDOM.render(
  <AuthProvider config={{ endpoint: 'https://example.logto.app', appId: 'react-17', resources: ['https://api.example.test'] }} callbackUrl="http://localhost:5173/callback">
    <SignInDialog branding={{ name: 'React 17 app' }} />
  </AuthProvider>,
  document.getElementById('app'),
)
