'use client'

import type { AuthProviderProps } from '@ouim/simple-logto'
import { AuthProvider } from '@ouim/simple-logto'
import { useRouter } from 'next/navigation'

const logtoConfig: AuthProviderProps['config'] = {
  endpoint: process.env.NEXT_PUBLIC_LOGTO_ENDPOINT ?? 'https://your-tenant.logto.app',
  appId: process.env.NEXT_PUBLIC_LOGTO_APP_ID ?? 'your-app-id',
  resources: [process.env.NEXT_PUBLIC_LOGTO_RESOURCE ?? 'https://your-api.example.com'],
}

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  return (
    <AuthProvider
      config={logtoConfig}
      callbackUrl={`${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/callback`}
      customNavigate={url => router.push(url)}
    >
      {children}
    </AuthProvider>
  )
}
