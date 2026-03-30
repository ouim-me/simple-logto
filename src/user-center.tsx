'use client'
import React, { useEffect, useState } from 'react'
import { useAuth } from './useAuth.js'
import { useNavigation } from './navigation.js'
import { getInitials, cn } from './utils.js'
import { User, LogOut, UserCircle } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from './components/ui/avatar.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu.js'
import { Button } from './components/ui/button.js'
import type { AdditionalPage } from './types.js'

/**
 * UserCenter Component
 *
 * User profile and account management dropdown component. Displays the current user's
 * avatar and name in a dropdown menu with sign-out and additional custom pages.
 *
 * Features:
 * - Displays user avatar with fallback initials
 * - Dropdown menu with user options
 * - Sign-out functionality with configurable redirect
 * - Support for additional custom pages/links
 * - Dark mode support
 * - Prevents hydration issues with client-only rendering
 *
 * @component
 * @param {string} [className] - CSS classes for the container element
 * @param {boolean} [globalSignOut=false] - Whether to perform global sign-out (logs out of entire Logto ecosystem) or local only
 * @param {string} [signoutCallbackUrl] - URL to redirect to after sign-out (default: current page)
 * @param {AdditionalPage[]} [additionalPages] - Array of custom pages/links to show in dropdown
 * @param {string} [themeClassnames] - Tailwind classnames for theming (light/dark mode)
 *
 * @example
 * // Basic user center
 * <UserCenter />
 *
 * @example
 * // With custom pages and dark mode
 * <UserCenter
 *   globalSignOut={false}
 *   signoutCallbackUrl="/"
 *   additionalPages={[
 *     { link: '/settings', text: 'Settings', icon: <Settings /> },
 *     { link: '/profile', text: 'Profile' }
 *   ]}
 *   themeClassnames="dark:bg-slate-900 dark:text-white bg-gray-50 text-gray-900"
 * />
 *
 * @returns {React.ReactElement} Dropdown component with user profile
 */
export interface UserCenterProps {
  className?: string
  globalSignOut?: boolean
  themeClassnames?: string
  signoutCallbackUrl?: string
  additionalPages?: AdditionalPage[]
}

export const UserCenter: React.FC<UserCenterProps> = ({
  className = '',
  globalSignOut = false,
  signoutCallbackUrl,
  additionalPages = [],
  themeClassnames = 'light:bg-stone-800 light:border-stone-700 light:text-stone-200',
}) => {
  const { user, isLoadingUser, signOut, signIn } = useAuth()
  const navigateTo = useNavigation()
  const [hasMounted, setHasMounted] = useState(false)

  useEffect(() => {
    setHasMounted(true)
  }, [])

  // Handle default signoutCallbackUrl safely on the client side
  const defaultSignoutUrl = hasMounted && typeof window !== 'undefined' ? window.location.href : '/'
  const finalSignoutUrl = signoutCallbackUrl || defaultSignoutUrl

  // Show loading state until mounted to prevent hydration mismatch
  if (!hasMounted || isLoadingUser) {
    return (
      <div className={`relative ${className}`}>
        <div className="h-8 w-8 rounded-full bg-slate-100 animate-pulse" />
      </div>
    )
  }

  if (user) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger className="outline-none">
          <Avatar className={`h-8 w-8 transition-all hover:ring-2 hover:ring-red-2 ${className}`}>
            {user.avatar ? (
              <AvatarImage src={user.avatar} alt={user.name || 'User'} className="object-cover" />
            ) : (
              <AvatarFallback className="bg-slate-50 text-slate-600 text-sm">{getInitials(user.name)}</AvatarFallback>
            )}
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className={`w-64 ${themeClassnames}`}>
          <DropdownMenuLabel className="px-2 py-2">
            <div className="flex flex-col space-y-1">
              <p className={`text-sm font-semibold `}>{user.name || 'User'}</p>
              {user.email && <p className={`text-xs text-slate-500 truncate `}>{user.email}</p>}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-slate-100" />
          {additionalPages.map(({ link, text, icon }, idx) => (
            <DropdownMenuItem key={idx} onSelect={() => navigateTo(link)}>
              <Button variant={'ghost'} className="w-full flex text-left">
                {icon &&
                  (React.isValidElement(icon)
                    ? React.cloneElement(icon as React.ReactElement, {
                        className: cn('mr-2.5 h-4 w-4', (icon as React.ReactElement).props.className),
                      })
                    : icon)}
                {text}
              </Button>
            </DropdownMenuItem>
          ))}
          {additionalPages.length > 0 && <DropdownMenuSeparator className="bg-slate-100" />}
          <DropdownMenuItem onClick={() => signOut({ callbackUrl: finalSignoutUrl, global: globalSignOut })}>
            <Button variant={'destructive'} className="w-full flex text-left">
              <LogOut className="mr-2.5 h-4 w-4" />
              Sign out
            </Button>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="outline-none">
        <Avatar className={`h-9 w-9 transition-all hover:ring-2 hover:ring-slate-200 ${className}`}>
          <AvatarFallback className="bg-slate-50">
            <UserCircle className="h-5 w-5 text-slate-400" />
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={`w-64 ${themeClassnames}`}>
        <DropdownMenuLabel className="px-3 py-2">
          <p className={`text-sm font-medium ${themeClassnames}`}>Sign in to your account</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-slate-100" />
        <DropdownMenuItem onClick={() => signIn()}>
          <Button variant={'default'} className=" w-full flex gap-1.5 text-left">
            <User className="h-4 w-4" />
            Sign in
          </Button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
