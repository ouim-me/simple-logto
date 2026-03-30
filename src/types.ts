import type { LogtoConfig } from '@logto/react'

export type LogtoUser = {
  id: string
  name?: string
  email?: string
  avatar?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

export type AuthMiddleware = 'auth' | 'guest' | undefined

export interface NavigationOptions {
  replace?: boolean // Use replaceState instead of pushState
  force?: boolean // Force navigation even if already on the same page
}

export interface AuthOptions {
  middleware?: AuthMiddleware
  redirectTo?: string
  redirectIfAuthenticated?: string
  navigationOptions?: NavigationOptions
}

export interface UsePermissionOptions {
  claimKeys?: string[]
  mode?: 'all' | 'any'
}

export interface AuthContextType {
  user: LogtoUser | null
  isLoadingUser: boolean
  signIn: (callbackUrl?: string, usePopup?: boolean) => Promise<void>
  signOut: (options?: { callbackUrl?: string; global?: boolean }) => Promise<void>
  refreshAuth: () => Promise<void>
  enablePopupSignIn?: boolean
}

export type AuthSignOutReason = 'user' | 'auth_error' | 'missing_access_token' | 'transient_error_limit'

export interface AuthTokenRefreshEvent {
  user: LogtoUser
  accessToken: string
  expiresAt?: number
  previousExpiresAt?: number
}

export interface AuthErrorEvent {
  error: Error
  isTransient: boolean
  willSignOut: boolean
}

export interface AuthSignOutEvent {
  reason: AuthSignOutReason
  global: boolean
  callbackUrl?: string
  error?: Error
}

export interface AuthProviderProps {
  children: React.ReactNode
  config: LogtoConfig
  callbackUrl?: string
  customNavigate?: (url: string, options?: NavigationOptions) => void
  enablePopupSignIn?: boolean
  onTokenRefresh?: (event: AuthTokenRefreshEvent) => void
  onAuthError?: (event: AuthErrorEvent) => void
  onSignOut?: (event: AuthSignOutEvent) => void
}

export interface CallbackPageProps {
  className?: string
  loadingComponent?: React.ReactNode
  successComponent?: React.ReactNode
  onSuccess?: () => void
  onError?: (error: Error) => void
  /** URL to redirect to after successful authentication. Defaults to `'/'`. */
  redirectTo?: string
}

export interface SignInPageProps {
  className?: string
  loadingComponent?: React.ReactNode
  errorComponent?: React.ReactNode | ((error: Error) => React.ReactNode)
}

export interface AdditionalPage {
  link: string
  text: string
  icon?: React.ReactNode
}
