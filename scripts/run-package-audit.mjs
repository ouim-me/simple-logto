import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const tempRoot = path.join(repoRoot, '.tmp', 'package-audit')
const artifactDir = path.join(tempRoot, 'artifacts')
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const npmRunner = process.env.npm_execpath ? process.execPath : npmExecutable

const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
const readme = readFileSync(path.join(repoRoot, 'readme.md'), 'utf8')

if (!existsSync(path.join(repoRoot, 'dist'))) {
  fail('Package audit requires an existing dist/ build. Run `npm run build` first.')
}

rmSync(tempRoot, { recursive: true, force: true })
mkdirSync(artifactDir, { recursive: true })

const packResult = runCommand(['pack', '--json', '--pack-destination', artifactDir], repoRoot, { captureOutput: true })
const packEntries = JSON.parse(packResult.stdout)
const packEntry = Array.isArray(packEntries) ? packEntries[0] : packEntries

if (!packEntry || !Array.isArray(packEntry.files)) {
  fail('npm pack --json did not return a file listing.')
}

const packedFiles = new Set(packEntry.files.map(file => file.path))
const expectedPackedFiles = new Set([
  'package.json',
  'readme.md',
  ...collectPackageEntryFiles(packageJson),
])

for (const expectedFile of expectedPackedFiles) {
  if (!packedFiles.has(expectedFile)) {
    fail(`Packed tarball is missing required file: ${expectedFile}`)
  }
}

const allowedImports = new Set(getAllowedPublicImports(packageJson))
const readmeImports = extractPackageImports(readme, packageJson.name)

for (const specifier of readmeImports) {
  if (!allowedImports.has(specifier)) {
    fail(`README references unsupported public import: ${specifier}`)
  }
}

console.log(`Package audit passed: ${expectedPackedFiles.size} required packed files, ${readmeImports.size} README import(s).`)

function collectPackageEntryFiles(pkg) {
  const files = new Set()

  for (const entry of [pkg.main, pkg.module, pkg.types]) {
    if (typeof entry === 'string' && entry.length > 0) {
      files.add(stripDotSlash(entry))
    }
  }

  if (pkg.exports && typeof pkg.exports === 'object') {
    for (const value of Object.values(pkg.exports)) {
      collectExportTargets(value, files)
    }
  }

  return [...files]
}

function collectExportTargets(value, files) {
  if (typeof value === 'string') {
    files.add(stripDotSlash(value))
    return
  }

  if (!value || typeof value !== 'object') {
    return
  }

  for (const nestedValue of Object.values(value)) {
    collectExportTargets(nestedValue, files)
  }
}

function getAllowedPublicImports(pkg) {
  const imports = [pkg.name]

  if (pkg.exports && typeof pkg.exports === 'object') {
    for (const exportKey of Object.keys(pkg.exports)) {
      if (exportKey === '.') {
        continue
      }

      imports.push(`${pkg.name}${exportKey.slice(1)}`)
    }
  }

  return imports
}

function extractPackageImports(markdown, packageName) {
  const codeFencePattern = /```[\w-]*\r?\n([\s\S]*?)```/g
  const importPattern = new RegExp(`${escapeForRegExp(packageName)}(?:\\/[^"'\\s\`;)]*)?`, 'g')
  const imports = new Set()
  let codeFenceMatch

  while ((codeFenceMatch = codeFencePattern.exec(markdown)) !== null) {
    const block = codeFenceMatch[1]
    const blockMatches = block.match(importPattern) ?? []

    for (const match of blockMatches) {
      imports.add(match)
    }
  }

  return imports
}

function escapeForRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripDotSlash(value) {
  return value.replace(/^\.\//, '')
}

function runCommand(args, cwd, options = {}) {
  const commandArgs = process.env.npm_execpath ? [process.env.npm_execpath, ...args] : args
  const result = spawnSync(npmRunner, commandArgs, {
    cwd,
    encoding: 'utf8',
    stdio: options.captureOutput ? 'pipe' : 'inherit',
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    if (options.captureOutput) {
      if (result.stdout) {
        process.stdout.write(result.stdout)
      }

      if (result.stderr) {
        process.stderr.write(result.stderr)
      }
    }

    process.exit(result.status ?? 1)
  }

  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
