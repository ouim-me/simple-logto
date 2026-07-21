'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { ArrowUpRight, Github, Mail, UserRound, X } from 'lucide-react'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { useAuth } from './useAuth.js'
import { hasPermission } from './usePermission.js'
import type { SignInDialogProps, SignInDialogProvider, SignInStrategy, UsePermissionOptions } from './types.js'

const classes = (...values: Array<string | undefined>) => values.filter(Boolean).join(' ')
let accessibleIdSequence = 0
const useAccessibleId = () => useState(() => `logto-authkit-description-${++accessibleIdSequence}`)[0]

export function SignedIn({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth()
  return isLoaded && isSignedIn ? <>{children}</> : null
}

export function SignedOut({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth()
  return isLoaded && !isSignedIn ? <>{children}</> : null
}

export function AuthLoading({ children }: { children?: ReactNode }) {
  const { isLoaded } = useAuth()
  return !isLoaded ? <>{children ?? <span className="logto-authkit-spinner" aria-label="Loading authentication" />}</> : null
}

export function AuthError({ children }: { children?: (error: Error) => ReactNode }) {
  const { error } = useAuth()
  if (!error) return null
  return <>{children?.(error) ?? <p className="logto-authkit-error" role="alert">{error.message}</p>}</>
}

export interface ProtectProps {
  children: ReactNode
  fallback?: ReactNode
  permission?: string | string[]
  permissionOptions?: UsePermissionOptions
}

export function Protect({ children, fallback = null, permission, permissionOptions }: ProtectProps) {
  const { isLoaded, isSignedIn, user } = useAuth()
  if (!isLoaded) return null
  const allowed = isSignedIn && (!permission || hasPermission(user, permission, permissionOptions))
  return <>{allowed ? children : fallback}</>
}

const providerLabel: Record<SignInStrategy, string> = {
  google: 'Continue with Google',
  github: 'Continue with GitHub',
  email: 'Continue with email',
}

function StrategyIcon({ strategy }: { strategy: SignInStrategy }) {
  if (strategy === 'github') return <Github aria-hidden="true" />
  if (strategy === 'email') return <Mail aria-hidden="true" />
  return (
    <svg className="logto-authkit-google" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.6h3.3c1.9-1.8 2.9-4.4 2.9-7.5Z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.3l-3.3-2.6c-.9.6-2.1 1-3.4 1a5.9 5.9 0 0 1-5.6-4.1H3v2.7A10.1 10.1 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.4 14a6 6 0 0 1 0-3.9V7.4H3a10 10 0 0 0 0 9.3L6.4 14Z" />
      <path fill="#EA4335" d="M12 6a5.4 5.4 0 0 1 3.9 1.5l2.9-2.9A9.8 9.8 0 0 0 3 7.4l3.4 2.7A5.9 5.9 0 0 1 12 6Z" />
    </svg>
  )
}

export function SignInDialog({
  trigger,
  returnTo,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  branding,
  title = 'Welcome back.',
  description = 'Choose how you’d like to continue.',
  footnote = 'A secure window will open. You’ll return here when you’re done.',
  providers,
  appearance,
}: SignInDialogProps) {
  const descriptionId = useAccessibleId()
  const { openSignIn, error } = useAuth()
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const [pending, setPending] = useState<SignInStrategy>()
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next)
    onOpenChange?.(next)
  }
  const providerItems: SignInDialogProvider[] =
    providers ?? (['google', 'github', 'email'] as const).map((strategy) => ({ strategy }))
  const hasExplicitLogo = branding && Object.prototype.hasOwnProperty.call(branding, 'logo')
  const logo = hasExplicitLogo
    ? branding?.logo
    : branding?.logoUrl
      ? <img src={branding.logoUrl} alt={branding.logoAlt ?? branding.name ?? ''} />
      : null
  const classNames = appearance?.classNames
  const style = {
    ...appearance?.style,
    '--logto-authkit-primary': appearance?.accentColor,
    '--logto-authkit-bg': appearance?.surfaceColor,
    '--logto-authkit-text': appearance?.textColor,
    '--logto-authkit-muted': appearance?.mutedColor,
    '--logto-authkit-border': appearance?.borderColor,
    '--logto-authkit-font': appearance?.fontFamily,
    '--logto-authkit-radius': appearance?.radius,
  } as CSSProperties

  const choose = async (strategy: SignInStrategy) => {
    setPending(strategy)
    try {
      await openSignIn({ strategy, mode: 'popup', returnTo })
      setOpen(false)
    } catch {
      // The provider exposes the actionable error while the dialog remains open.
    } finally {
      setPending(undefined)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger ?? <button type="button" className="logto-authkit-button">Sign in</button>}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={classes('logto-authkit-overlay', classNames?.overlay)} style={{ background: appearance?.backdropColor }} />
        <Dialog.Content
          className={classes('logto-authkit-dialog', classNames?.dialog)}
          data-theme={appearance?.theme ?? 'dark'}
          aria-describedby={descriptionId}
          style={style}
        >
          <header className={classes('logto-authkit-header', classNames?.header)}>
            {logo !== null ? <div className={classes('logto-authkit-brand', classNames?.brand)}><span className={classes('logto-authkit-logo', classNames?.logo)}>{logo}</span>{branding?.name ? <span>{branding.name}</span> : null}</div> : null}
            <Dialog.Title className={classes('logto-authkit-title', classNames?.title)}>{title}</Dialog.Title>
            <Dialog.Description id={descriptionId} className={classes('logto-authkit-description', classNames?.description)}>{description}</Dialog.Description>
          </header>
          <div className={classes('logto-authkit-strategies', classNames?.providers)}>
            {providerItems.map(({ strategy, label, icon }) => (
              <button key={strategy} type="button" data-provider={strategy} disabled={Boolean(pending)} onClick={() => void choose(strategy)} className={classes('logto-authkit-strategy', classNames?.provider)}>
                <span className="logto-authkit-provider-icon">{icon ?? <StrategyIcon strategy={strategy} />}</span>
                <span>{pending === strategy ? 'Opening…' : (label ?? providerLabel[strategy])}</span>
                <ArrowUpRight className="logto-authkit-provider-arrow" aria-hidden="true" />
              </button>
            ))}
          </div>
          {error ? <p className={classes('logto-authkit-error', classNames?.error)} role="alert">{error.message}</p> : null}
          {footnote !== null ? <p className={classes('logto-authkit-footnote', classNames?.footnote)}>{footnote}</p> : null}
          <Dialog.Close className={classes('logto-authkit-close', classNames?.close)} aria-label="Close sign-in"><X aria-hidden="true" /></Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function UserProfile() {
  const { user } = useAuth()
  if (!user) return null
  return <div className="logto-authkit-profile"><span className="logto-authkit-avatar">{user.avatar ? <img src={user.avatar} alt="" /> : <UserRound aria-hidden="true" />}</span><div><strong>{user.name ?? user.email ?? 'Signed-in user'}</strong>{user.email ? <span>{user.email}</span> : null}</div></div>
}
