# Backend Authentication for @ouim/simple-logto

This module provides JWT verification helpers for Node.js applications using Logto authentication. The verification is done manually by fetching public keys from Logto's JWKS endpoint and verifying JWT claims locally, providing better control and performance with built-in caching.

## Features

- ✅ Manual JWT verification with JWKS caching
- ✅ Express.js middleware support
- ✅ Next.js API route support
- ✅ Custom claim validation
- ✅ Scope-based authorization
- ✅ Multiple token sources (cookies + Authorization header)
- ✅ TypeScript support

## Installation

The backend helpers are included with the main package:

```bash
npm install @ouim/simple-logto
```

## Usage

### Express.js Middleware

`createExpressAuthMiddleware` automatically parses cookies for you so there's no need to install or `app.use` a separate `cookie-parser` middleware. Just import and mount the helper as shown below.

```javascript
import { createExpressAuthMiddleware } from '@ouim/simple-logto/backend'

const authMiddleware = createExpressAuthMiddleware({
  logtoUrl: 'https://your-logto-domain.com',
  audience: ['your-api-resource-identifier', 'your-secondary-resource'], // string or string[]
  cookieName: 'logto_authtoken', // optional, defaults to 'logto_authtoken'
  requiredScope: 'some_scope', // optional
})

// Use in your Express routes
app.get('/protected', authMiddleware, (req, res) => {
  // req.auth contains the authenticated user info
  res.json({
    message: 'Hello authenticated user!',
    userId: req.auth.userId,
    isAuthenticated: req.auth.isAuthenticated,
  })
})
```

### Next.js API Routes

```javascript
// pages/api/protected.js or app/api/protected/route.js
import { verifyNextAuth } from '@ouim/simple-logto/backend'

export async function GET(request) {
  const authResult = await verifyNextAuth(request, {
    logtoUrl: 'https://your-logto-domain.com',
    audience: 'your-api-resource-identifier', // or ['api-audience', 'fallback-audience']
    cookieName: 'logto_authtoken', // optional
    requiredScope: 'some_scope', // optional
  })

  if (!authResult.success) {
    return Response.json({ error: authResult.error }, { status: 401 })
  }

  return Response.json({
    message: 'Hello authenticated user!',
    userId: authResult.auth.userId,
    payload: authResult.auth.payload,
  })
}
```

### Next.js Middleware

```javascript
// middleware.js
import { verifyNextAuth } from '@ouim/simple-logto/backend'
import { NextResponse } from 'next/server'

export async function middleware(request) {
  // Only apply to API routes that need authentication
  if (request.nextUrl.pathname.startsWith('/api/protected')) {
    const authResult = await verifyNextAuth(request, {
      logtoUrl: process.env.LOGTO_URL,
      audience: process.env.LOGTO_AUDIENCE,
    })

    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Add auth info to headers for the API route
    const response = NextResponse.next()
    response.headers.set('x-user-id', authResult.auth.userId)
    return response
  }
}

export const config = {
  matcher: '/api/protected/:path*',
}
```

### Generic Usage

```javascript
import { verifyAuth } from '@ouim/simple-logto/backend'

// Verify with token string
try {
  const auth = await verifyAuth('your-jwt-token', {
    logtoUrl: 'https://your-logto-domain.com',
    audience: 'your-api-resource-identifier',
  })

  console.log('User ID:', auth.userId)
} catch (error) {
  console.error('Auth failed:', error.message)
}

// Verify with request object
try {
  const auth = await verifyAuth(requestObject, {
    logtoUrl: 'https://your-logto-domain.com',
    audience: 'your-api-resource-identifier',
  })
} catch (error) {
  console.error('Auth failed:', error.message)
}
```

## Token Sources

The verification helpers will look for the JWT token in the following order:

1. **Cookie**: `logto_authtoken` (or custom name specified in `cookieName`)
2. **Authorization Header**: `Bearer <token>`

## Configuration Options

- `logtoUrl`: Your Logto server URL (required)
- `audience`: Your API resource identifier or allowed identifiers (required for protected resource APIs, accepts `string | string[]`)
- `cookieName`: Custom cookie name (optional, defaults to 'logto_authtoken')
- `requiredScope`: Required scope for access (optional)
- `jwksCacheTtlMs`: Override the per-process JWKS cache TTL in milliseconds (optional, defaults to 5 minutes)
- `skipJwksCache`: Force a fresh JWKS fetch for this verification call instead of reading/writing the in-memory cache (optional)

## JWKS Cache Controls

The backend verifier keeps a per-process in-memory JWKS cache by default. That is usually the right tradeoff, but you can now control it explicitly when needed:

- Pass `jwksCacheTtlMs` to shorten or extend the cache lifetime for a specific verifier/middleware instance.
- Pass `skipJwksCache: true` to force a fresh JWKS fetch for a specific verification call.
- Call `invalidateJwksCache(logtoUrl)` to drop one tenant's cached JWKS entry.
- Call `clearJwksCache()` to flush the entire in-memory JWKS cache for the current process.

```ts
import { clearJwksCache, invalidateJwksCache, verifyAuth } from '@ouim/simple-logto/backend'

const auth = await verifyAuth(token, {
  logtoUrl: 'https://your-logto-domain.com',
  audience: 'your-api-resource-identifier',
  jwksCacheTtlMs: 60_000,
})

invalidateJwksCache('https://your-logto-domain.com')
clearJwksCache()
```

## Auth Context

When authentication is successful, you'll get an `AuthContext` object:

```typescript
interface AuthContext {
  userId: string // User ID from token
  isAuthenticated: boolean // Always true when verification succeeds
  payload: AuthPayload // Full JWT payload
}
```

## Error Handling

All verification functions will throw errors or return error responses when:

- No token is found
- Token is invalid or expired
- Token doesn't contain required scope
- JWKS verification fails
