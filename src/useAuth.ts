'use client'
import { useEffect, useMemo } from 'react'
import { useAuthContext } from './context.js'
import { useNavigation } from './navigation.js'
import type { AuthOptions, AuthContextType } from './types.js'

/**
 * useAuth Hook
 *
 * Main hook to access authentication state and functions. Provides user information,
 * loading state, and methods for sign-in/sign-out. Automatically handles route protection
 * based on middleware configuration.
 *
 * @param {AuthOptions} [options] - Configuration options for auth behavior
 * @param {AuthMiddleware} [options.middleware] - Route protection mode:
 *   - `'auth'` - Protect route - redirects unauthenticated users to `redirectTo` URL
 *   - `'guest'` - Guest-only route - redirects authenticated users to `redirectIfAuthenticated` URL
 *   - `undefined` - No protection
 * @param {string} [options.redirectTo] - URL to redirect to when middleware='auth' and user is not authenticated (default: '/signin')
 * @param {string} [options.redirectIfAuthenticated] - URL to redirect to when middleware='guest' and user is authenticated
 * @param {NavigationOptions} [options.navigationOptions] - Navigation behavior options
 *
 * @returns {AuthContextType} Object containing:
 *   - `user` - Current user object or null if not authenticated
 *   - `isLoadingUser` - Whether user data is still loading
 *   - `signIn` - Function to initiate sign-in flow
 *   - `signOut` - Function to sign out user
 *   - `refreshAuth` - Function to manually refresh authentication state
 *   - `enablePopupSignIn` - Whether popup sign-in is enabled
 *
 * @example
 * // Access user data and sign-in/sign-out functions
 * function Dashboard() {
 *   const { user, isLoadingUser, signOut } = useAuth({ middleware: 'auth' })
 *
 *   if (isLoadingUser) return <div>Loading...</div>
 *   if (!user) return null // Would have redirected by middleware
 *
 *   return (
 *     <div>
 *       Welcome, {user.name}!
 *       <button onClick={() => signOut()}>Sign Out</button>
 *     </div>
 *   )
 * }
 *
 * @example
 * // Protect a guest-only login page
 * function LoginPage() {
 *   const { user } = useAuth({
 *     middleware: 'guest',
 *     redirectIfAuthenticated: '/dashboard'
 *   })
 *
 *   return <div>Sign in form...</div>
 * }
 *
 * @throws {Error} If used outside of AuthProvider context
 */
export const useAuth = (options?: AuthOptions): AuthContextType => {
  const auth = useAuthContext()
  const { user, isLoadingUser } = auth
  const navigateTo = useNavigation()

  // Memoize the options to prevent infinite re-renders when options object reference changes
  const memoizedOptions = useMemo(
    () => ({
      middleware: options?.middleware,
      redirectTo: options?.redirectTo,
      redirectIfAuthenticated: options?.redirectIfAuthenticated,
      navigationOptions: options?.navigationOptions,
    }),
    [options?.middleware, options?.redirectTo, options?.redirectIfAuthenticated, options?.navigationOptions],
  )

  useEffect(() => {
    if (isLoadingUser) return

    const { middleware, redirectTo, redirectIfAuthenticated, navigationOptions } = memoizedOptions

    if (middleware === 'auth' && !user) {
      // User is not authenticated but the route requires authentication
      navigateTo(redirectTo || '/signin', navigationOptions)
    } else if (middleware === 'guest' && user && redirectIfAuthenticated) {
      // User is authenticated but the route is for guests only
      navigateTo(redirectIfAuthenticated, navigationOptions)
    }
  }, [user, isLoadingUser, memoizedOptions, navigateTo])

  return auth
}
