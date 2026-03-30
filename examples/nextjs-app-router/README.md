# Next.js App Router example

This example shows the package in a small Next.js App Router app with:

- `AuthProvider` wired through a client-side providers component
- `/signin` and `/callback` routes using `SignInPage` and `CallbackPage`
- a server route handler using `verifyNextAuth`

## Setup

Build the library first from the repo root so the local `file:../..` dependency has fresh `dist/` output:

```bash
npm install
npm run build
```

Then install and run the example:

```bash
cd examples/nextjs-app-router
copy .env.example .env.local
npm install
npm run dev
```

Use `http://localhost:3000`.

Add this redirect URI in Logto:

```text
http://localhost:3000/callback
```

## Files to look at

- `app/providers.tsx` wires `AuthProvider` into the App Router
- `app/signin/page.tsx` starts sign-in
- `app/callback/page.tsx` completes the callback flow
- `app/api/session/route.ts` verifies the session server-side with `verifyNextAuth`
