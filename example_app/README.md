# simple-logto example app

This app is a local auth playground for the library in the parent repo.

It does not consume a published package. Vite aliases `@ouim/simple-logto` directly to `../src`, so changes you make to the library are reflected here immediately.

## Setup

```bash
cd example_app
npm install
copy .env.example .env.local
```

Fill in `example_app/.env.local` with your Logto tenant values.

Required:

- `VITE_LOGTO_ENDPOINT`
- `VITE_LOGTO_APP_ID`

Optional:

- `VITE_LOGTO_RESOURCES`
- `VITE_LOGTO_SCOPES`

## Run

```bash
npm run dev
```

Use `http://localhost:3002`.

Add this redirect URI in Logto:

```text
http://localhost:3002/callback
```

Keep a real `/signin` route and `/callback` route. The example app already handles both and exposes redirect sign-in, popup sign-in, refresh, and sign-out actions for quick manual testing.
