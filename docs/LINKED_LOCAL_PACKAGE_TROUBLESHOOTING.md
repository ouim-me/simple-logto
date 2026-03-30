# Linked Local Package Troubleshooting

This guide covers integration issues that show up when consuming `@ouim/simple-logto` from a local path such as:

```json
{
  "dependencies": {
    "@ouim/simple-logto": "file:../simple-logto"
  }
}
```

These issues usually do not appear with the published npm package, but they are common during local development when the consumer app and the linked package each have their own `node_modules`.

## Symptoms

You may see one of these errors:

- `Invalid hook call. Hooks can only be called inside of the body of a function component`
- `Cannot read properties of null (reading 'useState')`
- Next.js App Router `ReactServerComponentsError`
- build failures involving `jose` resolution after merging `viteConfig`

## Why this happens

When `@ouim/simple-logto` is linked from a local folder, the consumer app can accidentally resolve:

- `react` from the app
- `react-dom` from the app
- but `@ouim/simple-logto` and `@logto/react` from the linked package's own dependency tree

That gives you multiple React instances in one app, which breaks hooks.

There is a second integration trap in Vite apps: if you spread `viteConfig` from `@ouim/simple-logto` and then replace `resolve.alias` instead of merging it, you can accidentally drop or override aliases that the package expects.

## Next.js App Router: `"use client"` errors

### Symptom

You import `SignInPage`, `CallbackPage`, `AuthProvider`, or another frontend export and Next.js throws:

- `You're importing a component that needs useLayoutEffect`
- `It only works in a Client Component`

### Cause

The frontend entry for `@ouim/simple-logto` must preserve the module-level `'use client'` directive in the built output. If that directive is stripped during packaging, Next.js treats the package entry as a Server Component import path.

### Fix

Make sure the built frontend entry keeps `'use client'` at the top of the published `dist/index.js` entry.

If you are consuming a local unreleased build, rebuild the package after applying that fix.

## Vite + linked package: invalid hook call

### Symptom

You see errors like:

- `Invalid hook call`
- `Cannot read properties of null (reading 'useState')`

This usually happens when rendering `AuthProvider`, `LogtoProvider`, `SignInPage`, `CallbackPage`, or hooks such as `useAuth`.

### Cause

The app and the linked package are resolving different copies of React.

### Fix

Force Vite to resolve all React imports from the consumer app's `node_modules`, and dedupe `react` and `react-dom`.

Example:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'
import { viteConfig } from '@ouim/simple-logto'

export default defineConfig(() => {
  const appReactPath = path.resolve(__dirname, './node_modules/react')
  const appReactDomPath = path.resolve(__dirname, './node_modules/react-dom')

  return {
    ...viteConfig,
    plugins: [react()],
    resolve: {
      ...(viteConfig.resolve ?? {}),
      dedupe: ['react', 'react-dom'],
      alias: {
        ...(viteConfig.resolve?.alias ?? {}),
        react: appReactPath,
        'react/jsx-runtime': path.resolve(appReactPath, 'jsx-runtime.js'),
        'react/jsx-dev-runtime': path.resolve(appReactPath, 'jsx-dev-runtime.js'),
        'react-dom': appReactDomPath,
        'react-dom/client': path.resolve(appReactDomPath, 'client.js'),
      },
    },
  }
})
```

After changing Vite config, restart the dev server so it rebuilds the module graph.

## Vite alias merge footgun

### Symptom

Your app builds in development but fails during `vite build`, often with a `jose` resolution error.

### Cause

You spread `viteConfig` from `@ouim/simple-logto`, then replace `resolve` or `resolve.alias` completely. That discards alias entries provided by the package.

### Fix

Always merge `resolve` and `resolve.alias` instead of replacing them:

```js
resolve: {
  ...(viteConfig.resolve ?? {}),
  alias: {
    ...(viteConfig.resolve?.alias ?? {}),
    '@': path.resolve(__dirname, './src'),
  },
}
```

If your app needs to override one of the inherited aliases, do it explicitly after the spread so the final value is obvious.

## Quick checks

If you suspect duplicate React, check:

```bash
npm ls react react-dom @logto/react @ouim/simple-logto
```

If the linked package shows its own installed `react` version that differs from the app, fix bundler resolution first.

## When this does not apply

If you installed the published package from npm and are not using a local `file:` dependency or symlinked workspace, this guide is probably not your issue. In that case, start with the main [README troubleshooting section](../README.md#troubleshooting).
