import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { LogtoUser, NavigationOptions } from './types'
import FingerprintJS from '@fingerprintjs/fingerprintjs'
import type { LogtoConfig } from '@logto/react'

/**
 * Validates Logto configuration for required fields
 * @param config - The LogtoConfig object to validate
 * @throws {Error} If required configuration is missing or invalid
 * @example
 * try {
 *   validateLogtoConfig(config);
 * } catch (error) {
 *   console.error('Invalid Logto config:', error.message);
 * }
 */
export const validateLogtoConfig = (config: LogtoConfig): void => {
  if (!config) {
    throw new Error('Logto configuration is required. Please provide a valid LogtoConfig object to AuthProvider.')
  }

  const errors: string[] = []

  // Check for endpoint (logtoUrl)
  if (!config.endpoint) {
    errors.push('`endpoint` (Logto URL) is required in configuration')
  } else if (typeof config.endpoint !== 'string' || config.endpoint.trim() === '') {
    errors.push('`endpoint` must be a non-empty string')
  } else {
    // Validate it's a valid URL
    try {
      new URL(config.endpoint)
    } catch {
      errors.push('`endpoint` must be a valid URL (e.g., "https://your-tenant.logto.app")')
    }
  }

  // Check for appId
  if (!config.appId) {
    errors.push('`appId` is required in configuration')
  } else if (typeof config.appId !== 'string' || config.appId.trim() === '') {
    errors.push('`appId` must be a non-empty string')
  }

  // Optional: Check for resources (audience) - log warning if not present
  // This is optional because some apps might not need it
  if (!config.resources || config.resources.length === 0) {
    console.warn(
      'Warning: No `resources` configured in Logto config. ' +
        'If you need to access protected backend APIs with JWTs, ensure at least one resource is configured. ' +
        'See: https://docs.logto.io/docs/recipes/configure-jwt-token',
    )
  }

  if (errors.length > 0) {
    const errorMessage =
      'Invalid Logto configuration:\n' +
      errors.map((e, i) => `  ${i + 1}. ${e}`).join('\n') +
      '\n\nPlease check your AuthProvider config. ' +
      'Example: <AuthProvider config={{ endpoint: "https://your-tenant.logto.app", appId: "your-app-id", resources: {...} }}>'

    throw new Error(errorMessage)
  }
}

/**
 * Transform Logto User Object
 *
 * Converts a Logto JWT claims object into a simplified LogtoUser format.
 * Maps JWT standard claims (sub, name, email, picture) to user object properties,
 * and preserves all additional claims from the original object.
 *
 * @param {any} logtoUser - Raw Logto user claims object from JWT token
 * @returns {LogtoUser | null} Simplified user object or null if input is falsy
 *
 * @example
 * const claims = { sub: 'user_123', name: 'John Doe', email: 'john@example.com', picture: 'http://...' };
 * const user = transformUser(claims);
 * // { id: 'user_123', name: 'John Doe', email: 'john@example.com', avatar: 'http://...' }
 *
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const transformUser = (logtoUser: any): LogtoUser | null => {
  if (!logtoUser) return null

  return {
    id: logtoUser.sub || '',
    name: logtoUser.name || logtoUser.username || '',
    email: logtoUser.email || '',
    avatar: logtoUser.picture || '',
    // Include all original properties
    ...logtoUser,
  }
}

// Global reference to custom navigate function (can be set by the provider)
let customNavigateFunction: ((url: string, options?: NavigationOptions) => void) | null = null

/**
 * Set Custom Navigation Function
 *
 * Registers a custom navigation handler for the entire auth library.
 * Used by AuthProvider to enable integration with client-side routers like React Router.
 * If not set, the library falls back to window.location for navigation.
 *
 * @param {Function | null} navigateFn - Navigation function with signature (url: string, options?: NavigationOptions) => void
 *                                        or null to clear the custom function
 * @internal
 *
 * @example
 * import { useNavigate } from 'react-router-dom';
 * import { setCustomNavigate } from '@ouim/simple-logto';
 *
 * // Inside a context or app component
 * const navigate = useNavigate();
 * setCustomNavigate((url) => navigate(url));
 */
export const setCustomNavigate = (navigateFn: ((url: string, options?: NavigationOptions) => void) | null) => {
  customNavigateFunction = navigateFn
}

/**
 * Navigate to a URL
 *
 * Universal navigation function that attempts client-side routing first (History API),
 * then falls back to direct window.location navigation. Respects custom navigation functions
 * set via setCustomNavigate for router integration.
 *
 * Supports:
 * - Custom routers (React Router, Next.js navigation, etc.) via setCustomNavigate
 * - Client-side History API for SPAs (pushState/replaceState)
 * - Direct window.location for absolute URLs and fallback
 *
 * @param {string} url - URL to navigate to (relative path like '/dashboard' or absolute URL)
 * @param {NavigationOptions} [options={}] - Navigation behavior options
 * @param {boolean} [options.replace=false] - Use replaceState instead of pushState (replaces history entry)
 * @param {boolean} [options.force=false] - Force navigation even if already on the same page
 *
 * @example
 * // Navigate to a relative path
 * navigateTo('/dashboard');
 *
 * @example
 * // Replace history entry instead of adding new one
 * navigateTo('/login', { replace: true });
 *
 * @example
 * // Force navigation even if already on the page
 * navigateTo('/dashboard', { force: true });
 */
export const navigateTo = (url: string, options: NavigationOptions = {}): void => {
  try {
    // Check if we're in a browser environment
    if (typeof window === 'undefined') return

    // Use custom navigate function if provided (e.g., from React Router)
    if (customNavigateFunction) {
      customNavigateFunction(url, options)
      return
    }

    const { replace = false, force = false } = options

    // Check if the URL is already the current URL to prevent infinite loops
    if (!force && (window.location.pathname === url || window.location.href === url)) {
      return
    }

    // For relative URLs, try to use History API for client-side routing
    if (url.startsWith('/')) {
      // Try to use History API if available (better for SPAs)
      if (window.history && (window.history.pushState || window.history.replaceState)) {
        if (replace && window.history.replaceState) {
          window.history.replaceState(null, '', url)
        } else if (window.history.pushState) {
          window.history.pushState(null, '', url)
        }

        // Dispatch a popstate event to notify router libraries
        const event = new PopStateEvent('popstate', { state: null })
        window.dispatchEvent(event)

        // Also dispatch a custom event for frameworks that listen for it
        const navigationEvent = new CustomEvent('navigate', { detail: { url, replace } })
        window.dispatchEvent(navigationEvent)

        return
      }
    }

    // Fallback to window.location for absolute URLs or if History API failed
    if (replace) {
      window.location.replace(url)
    } else {
      window.location.href = url
    }
  } catch (error) {
    // Final fallback - direct assignment
    console.warn('Navigation failed, using fallback method:', error)
    window.location.href = url
  }
}

/**
 * Get initials from name for avatar fallback
 */
export const getInitials = (name?: string): string => {
  if (!name) return 'U'

  const parts = name.split(' ')
  if (parts.length === 1) {
    return name.substring(0, 2).toUpperCase()
  }

  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Cookie management utilities
 */
export const cookieUtils = {
  /**
   * Set a cookie with the given name, value, and options
   */
  setCookie: (
    name: string,
    value: string,
    options: {
      expires?: Date | number
      maxAge?: number
      domain?: string
      path?: string
      secure?: boolean
      sameSite?: 'strict' | 'lax' | 'none'
      httpOnly?: boolean
    } = {},
  ) => {
    if (typeof document === 'undefined') return

    const { expires, maxAge, domain, path = '/', secure = window.location.protocol === 'https:', sameSite = 'lax' } = options

    let cookieString = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`

    if (expires) {
      const expireDate = typeof expires === 'number' ? new Date(Date.now() + expires * 24 * 60 * 60 * 1000) : expires
      cookieString += `; expires=${expireDate.toUTCString()}`
    }

    if (maxAge !== undefined) {
      cookieString += `; max-age=${maxAge}`
    }

    if (domain) {
      cookieString += `; domain=${domain}`
    }

    if (path) {
      cookieString += `; path=${path}`
    }

    if (secure) {
      cookieString += `; secure`
    }

    if (sameSite) {
      cookieString += `; samesite=${sameSite}`
    }

    document.cookie = cookieString
  },

  /**
   * Get a cookie value by name
   */
  getCookie: (name: string): string | null => {
    if (typeof document === 'undefined') return null

    const nameEQ = encodeURIComponent(name) + '='
    const cookies = document.cookie.split(';')

    for (let cookie of cookies) {
      cookie = cookie.trim()
      if (cookie.indexOf(nameEQ) === 0) {
        return decodeURIComponent(cookie.substring(nameEQ.length))
      }
    }

    return null
  },

  /**
   * Remove a cookie by name
   */
  removeCookie: (
    name: string,
    options: {
      domain?: string
      path?: string
    } = {},
  ) => {
    if (typeof document === 'undefined') return

    const { domain, path = '/' } = options

    let cookieString = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:01 GMT`

    if (domain) {
      cookieString += `; domain=${domain}`
    }

    if (path) {
      cookieString += `; path=${path}`
    }

    document.cookie = cookieString
  },
}

/**
 * Specialized functions for JWT token management
 */
export const jwtCookieUtils = {
  /**
   * Save JWT token to cookie.
   *
   * ⚠️  SECURITY NOTICE — XSS / non-httpOnly cookie
   * ─────────────────────────────────────────────────────────────────────────
   * This cookie is set from JavaScript, which means it cannot carry the
   * `HttpOnly` flag. Any JavaScript that runs on the same origin — including
   * injected scripts from an XSS vulnerability — can read the raw JWT value
   * from `document.cookie` and exfiltrate it.
   *
   * The cookie is still protected by `Secure` (HTTPS-only) and
   * `SameSite=Strict` (blocks cross-site request forgery), but those flags do
   * NOT prevent access by same-origin JavaScript.
   *
   * MITIGATIONS:
   *   1. Keep a strict Content-Security-Policy to reduce XSS attack surface.
   *   2. If your deployment includes a Node.js backend that handles the
   *      callback redirect, use `buildAuthCookieHeader()` from
   *      `@ouim/simple-logto/backend` to set an `HttpOnly` version of the
   *      same cookie from the server side. The browser will then send it
   *      automatically and it will be invisible to JavaScript.
   *
   * See: https://owasp.org/www-community/HttpOnly
   * ─────────────────────────────────────────────────────────────────────────
   */
  saveToken: (token: string) => {
    cookieUtils.setCookie('logto_authtoken', token, {
      expires: 7, // 7 days
      secure: true,
      sameSite: 'strict',
      path: '/',
    })
  },

  /**
   * Get JWT token from cookie
   */
  getToken: (): string | null => {
    return cookieUtils.getCookie('logto_authtoken')
  },

  /**
   * Remove JWT token from cookie
   */
  removeToken: () => {
    cookieUtils.removeCookie('logto_authtoken', {
      path: '/',
    })
  },
}

/**
 * Client-side guest utilities
 */
export const guestUtils = {
  /**
   * Generate a fingerprint-based guest ID
   */
  async generateGuestId(): Promise<string> {
    try {
      const fp = await FingerprintJS.load()
      const result = await fp.get()
      return result.visitorId
    } catch (error) {
      console.warn('Failed to generate fingerprint, falling back to UUID:', error)
      // Fallback to UUID generation
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID()
      }
      // Fallback UUID generation for older browsers
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
      })
    }
  },

  /**
   * Get guest ID from cookie
   */
  getGuestId(): string | null {
    return cookieUtils.getCookie('guest_logto_authtoken')
  },

  /**
   * Set guest ID cookie
   *
   * Uses cookieUtils.setCookie so that the same security flags applied to the
   * auth token cookie (Secure, SameSite=strict) are also applied here, making
   * both cookies consistent. The Secure flag is enforced regardless of the
   * current protocol so that the guest ID is never sent over plain HTTP.
   */
  async setGuestId(guestId?: string): Promise<string> {
    if (typeof document === 'undefined') return guestId || ''

    const id = guestId || (await this.generateGuestId())
    cookieUtils.setCookie('guest_logto_authtoken', id, {
      expires: 7, // 7 days (matches jwtCookieUtils.saveToken)
      secure: true,
      sameSite: 'strict',
      path: '/',
    })
    return id
  },

  /**
   * Ensure guest ID exists, create if not
   */
  async ensureGuestId(): Promise<string> {
    const existingId = this.getGuestId()
    if (existingId) {
      return existingId
    }
    return await this.setGuestId()
  },

  /**
   * Clear guest ID cookie
   */
  clearGuestId(): void {
    cookieUtils.removeCookie('guest_logto_authtoken', { path: '/' })
  },
}

/**
 * Utility function to combine class names (for components)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
