import type { AuthProviderProps, SessionPolicy, SignInOptions, SignInStrategy } from './types.js'

export const FLOW_STORAGE_KEY = 'logto-authkit:flow'
export const POPUP_COMPLETE_STORAGE_KEY = 'logto-authkit:popup-complete'
export const POPUP_TIMEOUT_MS = 5 * 60 * 1000
export const SESSION_REHYDRATE_EVENT = 'logto-authkit:session-rehydrate'

export interface StoredAuthFlow {
  id: string
  popup: boolean
  returnTo: string
  strategy?: SignInStrategy
  sessionPolicy: SessionPolicy
}

export const safeReturnPath = (value: string | null | undefined): string => {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/'
  return value
}

export const createFlowId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  }
  throw new Error('A cryptographically secure random source is required to start sign-in.')
}

interface PopupViewport {
  width: number
  height: number
  screenX: number
  screenY: number
}

export const getPopupFeatures = (viewport?: PopupViewport): string => {
  const bounds =
    viewport ??
    ({ width: window.innerWidth, height: window.innerHeight, screenX: window.screenX, screenY: window.screenY } satisfies PopupViewport)
  const width = Math.max(320, Math.min(520, bounds.width - 32))
  const height = Math.max(480, Math.min(760, bounds.height - 32))
  const left = Math.max(0, Math.round((bounds.width - width) / 2 + bounds.screenX))
  const top = Math.max(0, Math.round((bounds.height - height) / 2 + bounds.screenY))
  return `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=no`
}

type FlowConfig = Pick<AuthProviderProps, 'callbackUrl' | 'enablePopupSignIn' | 'signInPath' | 'defaultSignInMode' | 'sessionPolicy'>

export const normalizeSignInOptions = (config: FlowConfig, options: SignInOptions = {}) => ({
  strategy: options.strategy,
  mode: options.mode ?? config.defaultSignInMode ?? (config.enablePopupSignIn ? 'popup' : 'redirect'),
  returnTo: safeReturnPath(
    options.returnTo ??
      (typeof window === 'undefined' ? '/' : `${window.location.pathname}${window.location.search}${window.location.hash}`),
  ),
  callbackUrl: options.callbackUrl ?? config.callbackUrl ?? (typeof window === 'undefined' ? '' : window.location.href),
  sessionPolicy: options.sessionPolicy ?? config.sessionPolicy ?? ('explicit' as const),
})

export const directSignInFor = (strategy?: SignInStrategy) =>
  !strategy || strategy === 'email' ? undefined : ({ method: 'social', target: strategy } as const)

export const promptFor = (policy: SessionPolicy): 'login consent' | undefined =>
  policy === 'automatic' ? undefined : 'login consent'

export const tokenHasAudience = (token: string, audience: string): boolean => {
  try {
    const payload = token.split('.')[1]
    if (!payload) return false
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const decoded =
      typeof atob === 'function' ? atob(padded) : typeof Buffer !== 'undefined' ? Buffer.from(padded, 'base64').toString('utf8') : ''
    const claims = JSON.parse(decoded) as { aud?: unknown }
    return typeof claims.aud === 'string' ? claims.aud === audience : Array.isArray(claims.aud) && claims.aud.includes(audience)
  } catch {
    return false
  }
}

export const startPathFor = (signInPath: string | undefined, flow: StoredAuthFlow): string => {
  const base = typeof window === 'undefined' ? 'http://localhost' : window.location.origin
  const url = new URL(signInPath ?? '/signin', base)
  url.searchParams.set('authkit_flow', flow.id)
  if (flow.strategy) url.searchParams.set('strategy', flow.strategy)
  url.searchParams.set('policy', flow.sessionPolicy)
  url.searchParams.set('return_to', flow.returnTo)
  if (flow.popup) url.searchParams.set('popup', 'true')
  return `${url.pathname}${url.search}${url.hash}`
}

export const parseStoredFlow = (value: string | null): StoredAuthFlow | undefined => {
  if (!value) return undefined
  try {
    const flow = JSON.parse(value) as Partial<StoredAuthFlow>
    if (!flow.id || typeof flow.popup !== 'boolean') return undefined
    if (flow.strategy !== undefined && !['google', 'github', 'email'].includes(flow.strategy)) return undefined
    if (!['automatic', 'explicit', 'reauthenticate'].includes(flow.sessionPolicy ?? '')) return undefined
    return {
      id: flow.id,
      popup: flow.popup,
      returnTo: safeReturnPath(flow.returnTo),
      strategy: flow.strategy as SignInStrategy | undefined,
      sessionPolicy: flow.sessionPolicy as SessionPolicy,
    }
  } catch {
    return undefined
  }
}
