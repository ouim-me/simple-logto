import {
  buildAuthCookieHeader,
  createExpressAuthMiddleware,
  verifyAuth,
  verifyNextAuth,
} from '@ouim/simple-logto/backend'

const middleware = createExpressAuthMiddleware({
  logtoUrl: 'https://example.logto.app',
  audience: ['https://api.example.com', 'https://fallback.example.com'],
  allowGuest: true,
})

if (typeof middleware !== 'function') {
  throw new Error('Expected createExpressAuthMiddleware() to return a function.')
}

if (typeof verifyAuth !== 'function' || typeof verifyNextAuth !== 'function') {
  throw new Error('Expected backend helpers to be exported for ESM consumers.')
}

const cookieHeader = buildAuthCookieHeader('demo-token', { maxAge: 60 })

if (!cookieHeader.includes('SameSite=Strict')) {
  throw new Error('Expected buildAuthCookieHeader() to include SameSite=Strict.')
}

console.log('backend ESM smoke test passed')
