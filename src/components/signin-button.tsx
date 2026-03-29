'use client'
import React, { useState } from 'react'
import { useAuth } from '../useAuth.js'
import { Button } from './ui/button.js'
import type { ButtonProps } from './ui/button.js'

export interface SignInButtonProps extends Omit<ButtonProps, 'onClick'> {
  /**
   * The text label displayed on the button.
   * @default "Sign In"
   */
  label?: string

  /**
   * The URL to redirect to after successful sign-in.
   * If not provided, defaults to the AuthProvider's callbackUrl.
   */
  redirectUri?: string

  /**
   * Whether to use popup sign-in flow instead of redirect.
   * If not provided, defaults to the AuthProvider's enablePopupSignIn setting.
   */
  usePopup?: boolean

  /**
   * Optional callback to execute before initiating sign-in.
   * Useful for tracking or validation.
   */
  onBeforeSignIn?: () => void | Promise<void>

  /**
   * Optional callback to execute after sign-in completes.
   * Useful for tracking or post-sign-in logic.
   */
  onAfterSignIn?: () => void | Promise<void>

  /**
   * Optional callback to execute if sign-in fails.
   */
  onSignInError?: (error: Error) => void
}

/**
 * A simple, reusable button component for initiating the sign-in flow.
 *
 * @example
 * // Basic usage with default settings
 * <SignInButton />
 *
 * @example
 * // With custom props
 * <SignInButton
 *   label="Log in to your account"
 *   usePopup={true}
 *   variant="outline"
 *   onAfterSignIn={() => console.log('User signed in!')}
 * />
 *
 * @example
 * // With custom redirect
 * <SignInButton redirectUri="/dashboard" />
 */
export function SignInButton({
  label = 'Sign In',
  redirectUri,
  usePopup,
  onBeforeSignIn,
  onAfterSignIn,
  onSignInError,
  disabled,
  ...buttonProps
}: SignInButtonProps) {
  const { signIn, isLoadingUser } = useAuth()
  const [isLoading, setIsLoading] = useState(false)

  const isButtonDisabled = disabled || isLoadingUser || isLoading

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()

    try {
      setIsLoading(true)

      // Call before hook if provided
      if (onBeforeSignIn) {
        await onBeforeSignIn()
      }

      // Initiate sign-in with provided options
      await signIn(redirectUri, usePopup)

      // Call after hook if provided
      if (onAfterSignIn) {
        await onAfterSignIn()
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to sign in')
      if (onSignInError) {
        onSignInError(err)
      } else {
        console.error('Sign-in error:', err)
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Button disabled={isButtonDisabled} {...buttonProps} onClick={handleClick}>
      {label}
    </Button>
  )
}
