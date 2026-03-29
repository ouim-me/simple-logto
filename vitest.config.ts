import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      // Minimum thresholds enforced by `npm run test:coverage` / CI coverage job.
      // Baselines are set just below actual coverage after the Phase 5 test expansion
      // (statements ~65%, branches ~55%, functions ~74%, lines ~67%) so the gate fails
      // only on genuine regressions, not on floating-point rounding between runs.
      // Raise each threshold incrementally as Phase 6–9 tests are added.
      // Target: statements 80%, branches 75%, functions 80%, lines 80% (Phase 5 goal).
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 70,
        lines: 60,
      },
    },
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
