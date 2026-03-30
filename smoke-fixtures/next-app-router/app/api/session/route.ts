import { verifyNextAuth } from '@ouim/simple-logto/backend'

export async function GET(request: Request) {
  const result = await verifyNextAuth(request, {
    logtoUrl: process.env.LOGTO_URL ?? 'https://example.logto.app',
    audience: process.env.LOGTO_AUDIENCE ?? 'https://api.example.com',
    allowGuest: false,
  })

  if (!result.success) {
    return Response.json({ error: result.error }, { status: 401 })
  }

  return Response.json({
    userId: result.auth.userId,
    isAuthenticated: result.auth.isAuthenticated,
  })
}
