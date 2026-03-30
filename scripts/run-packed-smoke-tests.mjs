import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const tempRoot = path.join(repoRoot, '.tmp', 'packed-smoke')
const artifactDir = path.join(tempRoot, 'artifacts')
const workspaceDir = path.join(tempRoot, 'workspaces')
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const npmRunner = process.env.npm_execpath ? process.execPath : npmExecutable

const fixtures = [
  {
    name: 'vite-react',
    checks: [
      ['run', 'typecheck'],
      ['run', 'build'],
    ],
  },
  {
    name: 'react-router',
    checks: [
      ['run', 'typecheck'],
      ['run', 'build'],
    ],
  },
  {
    name: 'next-app-router',
    checks: [
      ['run', 'typecheck'],
      ['run', 'build'],
    ],
  },
  {
    name: 'node-backend',
    checks: [
      ['run', 'typecheck'],
      ['run', 'check:esm'],
      ['run', 'check:cjs'],
    ],
  },
  {
    name: 'bundler-config',
    checks: [
      ['run', 'typecheck'],
      ['run', 'check:esm'],
      ['run', 'check:cjs'],
    ],
  },
]

if (!existsSync(path.join(repoRoot, 'dist'))) {
  console.error('Packed smoke tests require an existing dist/ build. Run `npm run build` first.')
  process.exit(1)
}

rmSync(tempRoot, { recursive: true, force: true })
mkdirSync(artifactDir, { recursive: true })
mkdirSync(workspaceDir, { recursive: true })

const packResult = runCommand(['pack', '--pack-destination', artifactDir], repoRoot, { captureOutput: true })
const tarballName = packResult.stdout.trim().split(/\r?\n/).filter(Boolean).pop()

if (!tarballName) {
  console.error('npm pack did not return a tarball name.')
  process.exit(1)
}

const tarballPath = path.join(artifactDir, tarballName)

for (const fixture of fixtures) {
  runFixture(fixture, tarballPath)
}

console.log(`Packed smoke tests passed for ${fixtures.length} fixture(s).`)

function runFixture(fixture, tarballPath) {
  const sourceDir = path.join(repoRoot, 'smoke-fixtures', fixture.name)
  const targetDir = path.join(workspaceDir, fixture.name)

  cpSync(sourceDir, targetDir, { recursive: true })

  const packageJsonPath = path.join(targetDir, 'package.json')
  const packageJson = readFileSync(packageJsonPath, 'utf8')
  const tarballSpecifier = `file:${toPosixPath(path.relative(targetDir, tarballPath))}`
  writeFileSync(packageJsonPath, packageJson.replace(/__SIMPLE_LOGTO_TARBALL__/g, tarballSpecifier))

  console.log(`\n[smoke] ${fixture.name}: npm install`)
  runCommand(['install', '--no-fund', '--no-audit'], targetDir)

  for (const args of fixture.checks) {
    console.log(`[smoke] ${fixture.name}: npm ${args.join(' ')}`)
    runCommand(args, targetDir)
  }
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

function toPosixPath(value) {
  return value.split(path.sep).join('/')
}
