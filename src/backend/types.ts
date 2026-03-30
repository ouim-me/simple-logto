export interface AuthPayload {
  sub: string // user ID
  scope: string
  iss?: string // issuer
  aud?: string | string[] // audience — RFC 7519 §4.1.3 allows string or array
  exp?: number // expiration time (Unix seconds)
  nbf?: number // not before (Unix seconds)
  iat?: number // issued at (Unix seconds)
  [key: string]: unknown
}

export interface AuthContext {
  userId: string | null
  isAuthenticated: boolean
  payload: AuthPayload | null
  isGuest?: boolean
  guestId?: string
}

export interface VerifyAuthOptions {
  logtoUrl: string
  audience?: string | string[] // optional — supports single-resource and multi-resource API setups
  cookieName?: string
  requiredScope?: string
  allowGuest?: boolean
  jwksCacheTtlMs?: number
  skipJwksCache?: boolean
}

// Express middleware types
export interface ExpressRequest {
  cookies?: { [key: string]: string }
  headers: { [key: string]: string | string[] | undefined }
  auth?: AuthContext
}

export interface ExpressResponse {
  status: (code: number) => ExpressResponse
  json: (obj: unknown) => ExpressResponse
  /**
   * Set a response header. Present on all real Express `Response` objects
   * (inherited from `http.ServerResponse`). Typed as optional here to keep
   * the interface compatible with minimal test stubs, but the CSRF middleware
   * depends on it being present to set the CSRF cookie.
   */
  setHeader?: (name: string, value: string) => void
}

export type ExpressNext = (err?: unknown) => void

// Next.js types
export interface NextRequest {
  cookies?: {
    get: (name: string) => { value: string } | undefined
  }
  headers: {
    get: (name: string) => string | null
  }
}

export interface NextResponse {
  json: (body: unknown, init?: { status?: number }) => NextResponse
}
