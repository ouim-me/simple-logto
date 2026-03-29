const {
  buildAuthCookieHeader,
  createExpressAuthMiddleware,
  hasRole,
  hasScopes,
  requireRole,
  requireScopes,
  verifyAuth,
  verifyNextAuth,
} = require('@ouim/simple-logto/backend')

const middleware = createExpressAuthMiddleware({
  logtoUrl: 'https://example.logto.app',
  audience: ['https://api.example.com', 'https://fallback.example.com'],
  allowGuest: true,
})

if (typeof middleware !== 'function') {
  throw new Error('Expected createExpressAuthMiddleware() to return a function.')
}

if (
  typeof verifyAuth !== 'function' ||
  typeof verifyNextAuth !== 'function' ||
  typeof hasScopes !== 'function' ||
  typeof requireScopes !== 'function' ||
  typeof hasRole !== 'function' ||
  typeof requireRole !== 'function'
) {
  throw new Error('Expected backend helpers to be exported for CommonJS consumers.')
}

const cookieHeader = buildAuthCookieHeader('demo-token', { maxAge: 60 })
const auth = {
  userId: 'user-1',
  isAuthenticated: true,
  payload: {
    sub: 'user-1',
    scope: 'read:profile write:profile',
    roles: ['admin'],
  },
}

if (!cookieHeader.includes('HttpOnly')) {
  throw new Error('Expected buildAuthCookieHeader() to include HttpOnly.')
}

if (!hasScopes(auth, ['read:profile', 'write:profile'])) {
  throw new Error('Expected hasScopes() to validate exported scope helpers.')
}

if (!hasRole(auth, 'admin')) {
  throw new Error('Expected hasRole() to validate exported role helpers.')
}

requireScopes(auth, ['read:profile', 'write:profile'])
requireRole(auth, 'admin')

console.log('backend CommonJS smoke test passed')
