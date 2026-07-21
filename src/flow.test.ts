import { describe, expect, it } from 'vitest'
import {
  directSignInFor,
  getPopupFeatures,
  normalizeSignInOptions,
  parseStoredFlow,
  promptFor,
  safeReturnPath,
  startPathFor,
  tokenHasAudience,
  type StoredAuthFlow,
} from './flow.js'

const config = {
  callbackUrl: 'http://localhost:3002/callback',
  enablePopupSignIn: true,
  sessionPolicy: 'explicit' as const,
}

const flow: StoredAuthFlow = {
  id: 'flow-123',
  popup: true,
  returnTo: '/library?tab=recent',
  strategy: 'github',
  sessionPolicy: 'explicit',
}

describe('enhanced sign-in flow boundaries', () => {
  it.each([undefined, null, '', 'https://evil.example', '//evil.example', 'javascript:alert(1)'])(
    'rejects unsafe return path %s',
    (value) => expect(safeReturnPath(value)).toBe('/'),
  )

  it('preserves application-local return paths', () => {
    expect(safeReturnPath('/library?tab=recent#top')).toBe('/library?tab=recent#top')
  })

  it('preserves the hosted experience when no strategy is requested', () => {
    expect(normalizeSignInOptions(config, { returnTo: '/' })).toEqual({
      strategy: undefined,
      mode: 'popup',
      returnTo: '/',
      callbackUrl: config.callbackUrl,
      sessionPolicy: 'explicit',
    })
  })

  it('only creates direct sign-in parameters for social strategies', () => {
    expect(directSignInFor('google')).toEqual({ method: 'social', target: 'google' })
    expect(directSignInFor('github')).toEqual({ method: 'social', target: 'github' })
    expect(directSignInFor('email')).toBeUndefined()
    expect(directSignInFor()).toBeUndefined()
  })

  it('only lets automatic policy silently reuse the tenant session', () => {
    expect(promptFor('automatic')).toBeUndefined()
    expect(promptFor('explicit')).toBe('login consent')
    expect(promptFor('reauthenticate')).toBe('login consent')
  })

  it('accepts an initial access token only for the requested audience', () => {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const token = `${encode({ alg: 'none' })}.${encode({ aud: ['https://api.example.test'] })}.signature`
    expect(tokenHasAudience(token, 'https://api.example.test')).toBe(true)
    expect(tokenHasAudience(token, 'https://other.example.test')).toBe(false)
    expect(tokenHasAudience('not-a-token', 'https://api.example.test')).toBe(false)
  })

  it('serializes only a local return path into the popup start URL', () => {
    expect(startPathFor('/signin', flow)).toBe(
      '/signin?authkit_flow=flow-123&strategy=github&policy=explicit&return_to=%2Flibrary%3Ftab%3Drecent&popup=true',
    )
  })

  it('rejects malformed stored flow data', () => {
    expect(parseStoredFlow('not-json')).toBeUndefined()
    expect(parseStoredFlow(JSON.stringify({ ...flow, strategy: 'unknown' }))).toBeUndefined()
    expect(parseStoredFlow(JSON.stringify(flow))).toEqual(flow)
  })

  it('centers a bounded popup', () => {
    expect(getPopupFeatures({ width: 1440, height: 900, screenX: 100, screenY: 20 })).toContain(
      'width=520,height=760,left=560,top=90',
    )
  })
})
