# Backend verification example

`auth-server.mjs` shows the matching backend side for the Vite React example app.

It imports `createExpressAuthMiddleware` from the repo's built `dist/` output to protect an `/api/session` endpoint and read the auth cookie that the frontend keeps in sync.

This file is intentionally small and focused on the verification flow. Use it as a starting point if you want to pair the frontend playground with a local API.

Build the library from the repo root first:

```bash
npm install
npm run build
```
