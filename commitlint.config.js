/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],

  rules: {
    // Allow the scopes used in this project
    'scope-enum': [
      2,
      'always',
      [
        'auth',
        'backend',
        'csrf',
        'ui',
        'types',
        'deps',
        'ci',
        'release',
        'docs',
        'config',
        'hooks',
        'utils',
        'context',
        'callback',
        'user-center',
      ],
    ],
    // Enforce 72-char subject line limit (GitHub truncates at ~72 chars in PR lists)
    'header-max-length': [2, 'always', 72],
    // Subject must not end with a period
    'subject-full-stop': [2, 'never', '.'],
    // Subject case: block ALL-CAPS, PascalCase, and Title Case subjects.
    // Severity 2 (error) — these forms are consistently avoided in this repo's history.
    'subject-case': [
      2,
      'never',
      ['start-case', 'pascal-case', 'upper-case'],
    ],
  },
};
