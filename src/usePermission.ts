'use client'
import { useMemo } from 'react'
import { useAuthContext } from './context.js'
import type { LogtoUser, UsePermissionOptions } from './types.js'

const DEFAULT_PERMISSION_CLAIM_KEYS = ['permissions', 'scope', 'scp']

function normalizePermissionInput(value: string | string[]): string[] {
  return (Array.isArray(value) ? value : [value])
    .flatMap(permission => permission.split(/[,\s]+/))
    .map(permission => permission.trim())
    .filter(Boolean)
}

function readPermissionClaims(user: LogtoUser | null, claimKeys: string[]): string[] {
  if (!user) return []

  for (const claimKey of claimKeys) {
    const claimValue = user[claimKey]
    if (Array.isArray(claimValue) && claimValue.every(permission => typeof permission === 'string')) {
      return normalizePermissionInput(claimValue)
    }

    if (typeof claimValue === 'string') {
      return normalizePermissionInput(claimValue)
    }
  }

  return []
}

/**
 * Return `true` when the current frontend auth user contains the requested permission claim.
 *
 * Reads the client-side `user` object exposed by `AuthProvider`, which is built from
 * Logto's frontend claims. This is intended for conditional rendering only. Use the
 * backend verifier helpers for authoritative server-side authorization decisions.
 */
export function usePermission(
  permission: string | string[],
  options: UsePermissionOptions = {},
): boolean {
  const { user, isLoadingUser } = useAuthContext()

  return useMemo(() => {
    if (isLoadingUser) {
      return false
    }

    const requiredPermissions = normalizePermissionInput(permission)
    if (requiredPermissions.length === 0) {
      return true
    }

    const claimKeys = options.claimKeys?.length ? options.claimKeys : DEFAULT_PERMISSION_CLAIM_KEYS
    const grantedPermissions = readPermissionClaims(user, claimKeys)
    const mode = options.mode ?? 'all'

    return mode === 'any'
      ? requiredPermissions.some(requiredPermission => grantedPermissions.includes(requiredPermission))
      : requiredPermissions.every(requiredPermission => grantedPermissions.includes(requiredPermission))
  }, [isLoadingUser, options.claimKeys, options.mode, permission, user])
}
