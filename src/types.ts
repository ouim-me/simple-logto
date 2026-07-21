import type { CSSProperties, ReactNode } from 'react'
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
  /** Configured identity endpoint; useful for direct Account API clients. */
  endpoint: string
  user: LogtoUser | null
  isLoadingUser: boolean
  isLoaded: boolean
  isSignedIn: boolean
  error: Error | null
  signIn: AuthSignIn
  openSignIn: (options?: SignInOptions) => Promise<void>
  signOut: (options?: { callbackUrl?: string; global?: boolean }) => Promise<void>
  refreshAuth: () => Promise<void>
  getAccountAccessToken: () => Promise<string>
  getApiAccessToken: (resource?: string) => Promise<string>
  getOrganizationAccessToken: (organizationId: string, resource?: string) => Promise<string>
  enablePopupSignIn?: boolean
}

export type SessionPolicy = 'automatic' | 'explicit' | 'reauthenticate'
export type SignInStrategy = 'google' | 'github' | 'email'
export type SignInMode = 'popup' | 'redirect'

export interface SignInOptions {
  strategy?: SignInStrategy
  mode?: SignInMode
  returnTo?: string
  callbackUrl?: string
  sessionPolicy?: SessionPolicy
}

export interface AuthSignIn {
  (callbackUrl?: string, usePopup?: boolean): Promise<void>
  (options: SignInOptions): Promise<void>
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
  /** Local route that hosts SignInPage for popup authentication. Defaults to `/signin`. */
  signInPath?: string
  /** Default mode used by the object-style signIn API. */
  defaultSignInMode?: SignInMode
  /** Whether a new sign-in may silently reuse the tenant session. Defaults to `explicit`. */
  sessionPolicy?: SessionPolicy
  /** Optional endpoint that exchanges a verified API token for an HttpOnly app session. */
  sessionEndpoint?: string
  authCookie?: AuthCookieOptions
  onTokenRefresh?: (event: AuthTokenRefreshEvent) => void
  onAuthError?: (event: AuthErrorEvent) => void
  onSignOut?: (event: AuthSignOutEvent) => void
}

export interface AuthCookieOptions {
  cookieName?: string
  expires?: Date | number
  maxAge?: number
  domain?: string
  path?: string
  secure?: boolean
  sameSite?: 'strict' | 'lax' | 'none'
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
  icon?: ReactNode
}

export interface SignInDialogProvider {
  strategy: SignInStrategy
  label?: ReactNode
  icon?: ReactNode
}

export interface SignInDialogBranding {
  name?: string
  logo?: ReactNode
  logoUrl?: string
  logoAlt?: string
}

export type SignInDialogClassNames = Partial<
  Record<'overlay' | 'dialog' | 'header' | 'brand' | 'logo' | 'title' | 'description' | 'providers' | 'provider' | 'error' | 'footnote' | 'close', string>
>

export interface SignInDialogAppearance {
  theme?: 'light' | 'dark' | 'auto'
  accentColor?: string
  surfaceColor?: string
  textColor?: string
  mutedColor?: string
  borderColor?: string
  backdropColor?: string
  fontFamily?: string
  radius?: string
  style?: CSSProperties
  classNames?: SignInDialogClassNames
}

export interface SignInDialogProps {
  trigger?: ReactNode
  returnTo?: string
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  branding?: SignInDialogBranding
  title?: ReactNode
  description?: ReactNode
  footnote?: ReactNode | null
  providers?: SignInDialogProvider[]
  appearance?: SignInDialogAppearance
}
