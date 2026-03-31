const DEPRECATION_WARNING_KEY = '__simpleLogtoDeprecationWarnings'

type PublicEntrypoint = 'root' | 'backend' | 'bundler-config'

const replacementByEntrypoint: Record<PublicEntrypoint, string> = {
  root: '@ouim/logto-authkit',
  backend: '@ouim/logto-authkit/server',
  'bundler-config': '@ouim/logto-authkit/bundler-config',
}

const sourceByEntrypoint: Record<PublicEntrypoint, string> = {
  root: '@ouim/simple-logto',
  backend: '@ouim/simple-logto/backend',
  'bundler-config': '@ouim/simple-logto/bundler-config',
}

export function warnPackageDeprecation(entrypoint: PublicEntrypoint): void {
  if (getNodeEnv() === 'production') {
    return
  }

  if (typeof console === 'undefined' || typeof console.warn !== 'function') {
    return
  }

  const warnings = getWarningRegistry()

  if (warnings.has(entrypoint)) {
    return
  }

  warnings.add(entrypoint)

  console.warn(
    `[simple-logto] Deprecation notice: \`${sourceByEntrypoint[entrypoint]}\` will move to ` +
      `\`${replacementByEntrypoint[entrypoint]}\` in the next release line. ` +
      'Plan the migration now; there will be no compatibility shim for `/backend`.'
  )
}

function getNodeEnv(): string | undefined {
  if (typeof process === 'undefined' || !process.env) {
    return undefined
  }

  return process.env.NODE_ENV
}

function getWarningRegistry(): Set<PublicEntrypoint> {
  const globalState = globalThis as typeof globalThis & Record<string, Set<PublicEntrypoint> | undefined>

  if (!globalState[DEPRECATION_WARNING_KEY]) {
    globalState[DEPRECATION_WARNING_KEY] = new Set<PublicEntrypoint>()
  }

  return globalState[DEPRECATION_WARNING_KEY]!
}

export function resetPackageDeprecationWarningsForTests(): void {
  const globalState = globalThis as typeof globalThis & Record<string, Set<PublicEntrypoint> | undefined>

  delete globalState[DEPRECATION_WARNING_KEY]
}
