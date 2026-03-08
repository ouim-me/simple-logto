export interface AuthPayload {
  sub: string // user ID
  scope: string
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
  audience: string
  cookieName?: string
  requiredScope?: string
  allowGuest?: boolean
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
}

export type ExpressNext = (err?: unknown) => void

// Next.js types
export interface NextRequest {
  cookies: {
    get: (name: string) => { value: string } | undefined
  }
  headers: {
    get: (name: string) => string | null
  }
}

export interface NextResponse {
  json: (body: unknown, init?: { status?: number }) => NextResponse
}
