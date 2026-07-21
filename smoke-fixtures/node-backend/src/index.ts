import { createExpressAuthMiddleware, hasOrganization, hasRole, hasScopes, requireOrganization, requireRole, requireScopes } from '@ouim/logto-authkit/server'
import { createAuthSessionMiddleware, sealAuthSession } from '@ouim/logto-authkit/server/session'
import type { AuthContext, VerifyAuthOptions } from '@ouim/logto-authkit/server'

const options: VerifyAuthOptions = {
  logtoUrl: 'https://example.logto.app',
  audience: ['https://api.example.com', 'https://fallback.example.com'],
  allowGuest: true,
}

const authContext: AuthContext = {
  userId: 'user-1',
  isAuthenticated: true,
  payload: {
    sub: 'user-1',
    scope: 'openid profile',
    roles: ['admin'],
  },
}

const middleware = createExpressAuthMiddleware(options)
const canManageUsers = hasScopes(authContext, ['openid', 'profile'], { mode: 'all' }) && hasRole(authContext, 'admin')

requireScopes(authContext, 'openid profile')
requireRole(authContext, 'admin')

void authContext
void middleware
void canManageUsers
void hasOrganization
void requireOrganization
void createAuthSessionMiddleware
void sealAuthSession
