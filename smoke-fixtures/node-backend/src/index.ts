import { createExpressAuthMiddleware } from '@ouim/simple-logto/backend'
import type { AuthContext, VerifyAuthOptions } from '@ouim/simple-logto/backend'

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
  },
}

const middleware = createExpressAuthMiddleware(options)

void authContext
void middleware
