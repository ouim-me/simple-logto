'use client'

import './styles/authkit.css'

export { AuthProvider } from './context.js'
export { useAuth } from './useAuth.js'
export { useUser, useSession } from './useAuth.js'
export { usePermission, hasPermission } from './usePermission.js'
export { UserCenter } from './user-center.js'
export { UserCenter as UserButton } from './user-center.js'
export { CallbackPage } from './callback.js'
export { SignInPage } from './signin.js'
export { SignInButton } from './components/signin-button.js'
export { AuthError, AuthLoading, Protect, SignedIn, SignedOut, SignInDialog, UserProfile } from './auth-primitives.js'
export type { ProtectProps } from './auth-primitives.js'
export { getBundlerConfig, viteConfig, webpackConfig, nextjsConfig } from './bundler-config.js'
export { cookieUtils, jwtCookieUtils, validateLogtoConfig } from './utils.js'
export type {
  LogtoUser,
  AuthOptions,
  AuthMiddleware,
  AuthContextType,
  AuthProviderProps,
  AuthCookieOptions,
  AuthSignIn,
  CallbackPageProps,
  SignInPageProps,
  NavigationOptions,
  AdditionalPage,
  UsePermissionOptions,
  SessionPolicy,
  SignInStrategy,
  SignInMode,
  SignInOptions,
  SignInDialogProvider,
  SignInDialogBranding,
  SignInDialogClassNames,
  SignInDialogAppearance,
  SignInDialogProps,
} from './types.js'
export type { SignInButtonProps } from './components/signin-button.js'
export { UserScope } from '@logto/react'
