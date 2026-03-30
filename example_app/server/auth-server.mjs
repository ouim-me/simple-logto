import express from 'express'
import { createExpressAuthMiddleware } from '../../dist/backend/index.js'

const app = express()
app.use(express.json())

const authMiddleware = createExpressAuthMiddleware({
  logtoUrl: process.env.LOGTO_URL ?? 'https://your-tenant.logto.app',
  audience: process.env.LOGTO_AUDIENCE ?? 'https://your-api.example.com',
})

app.get('/api/session', authMiddleware, (req, res) => {
  res.json({
    userId: req.auth.userId,
    isAuthenticated: req.auth.isAuthenticated,
    scope: req.auth.payload.scope ?? null,
  })
})

app.listen(3001, () => {
  console.log('Example auth server listening on http://localhost:3001')
})
