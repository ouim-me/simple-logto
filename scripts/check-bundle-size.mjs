import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')

const sizeBudgets = [
  {
    label: 'frontend-esm',
    file: 'dist/index.js',
    maxBytes: 300_000,
    maxGzipBytes: 80_000,
  },
  {
    label: 'frontend-cjs',
    file: 'dist/index.cjs',
    maxBytes: 190_000,
    maxGzipBytes: 65_000,
  },
  {
    label: 'backend-esm',
    file: 'dist/backend/index.js',
    maxBytes: 15_000,
    maxGzipBytes: 4_500,
  },
  {
    label: 'backend-cjs',
    file: 'dist/backend/index.cjs',
    maxBytes: 12_000,
    maxGzipBytes: 4_000,
  },
  {
    label: 'bundler-esm',
    file: 'dist/bundler-config.js',
    maxBytes: 1_000,
    maxGzipBytes: 500,
  },
  {
    label: 'bundler-cjs',
    file: 'dist/bundler-config.cjs',
    maxBytes: 1_000,
    maxGzipBytes: 450,
  },
]

const failures = []
const rows = []

for (const budget of sizeBudgets) {
  const filePath = path.join(repoRoot, budget.file)

  if (!existsSync(filePath)) {
    fail(`Bundle size check requires ${budget.file}. Run \`npm run build\` first.`)
  }

  const contents = readFileSync(filePath)
  const rawBytes = contents.byteLength
  const gzipBytes = gzipSync(contents, { level: 9 }).byteLength

  rows.push({
    label: budget.label,
    file: budget.file,
    rawBytes,
    gzipBytes,
    maxBytes: budget.maxBytes,
    maxGzipBytes: budget.maxGzipBytes,
  })

  if (rawBytes > budget.maxBytes) {
    failures.push(
      `${budget.file} raw size ${formatKiB(rawBytes)} exceeds budget ${formatKiB(budget.maxBytes)}.`,
    )
  }

  if (gzipBytes > budget.maxGzipBytes) {
    failures.push(
      `${budget.file} gzip size ${formatKiB(gzipBytes)} exceeds budget ${formatKiB(budget.maxGzipBytes)}.`,
    )
  }
}

console.log('Bundle size report:')

for (const row of rows) {
  console.log(
    [
      `${row.label}:`,
      `raw ${formatKiB(row.rawBytes)}/${formatKiB(row.maxBytes)}`,
      `gzip ${formatKiB(row.gzipBytes)}/${formatKiB(row.maxGzipBytes)}`,
      `(${row.file})`,
    ].join(' '),
  )
}

if (failures.length > 0) {
  console.error('\nBundle size budget failed:')

  for (const failure of failures) {
    console.error(`- ${failure}`)
  }

  process.exit(1)
}

console.log('\nBundle size budgets passed.')

function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(2)} KiB`
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
