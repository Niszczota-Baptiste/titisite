import security from 'eslint-plugin-security';
import globals from 'globals';

/**
 * Security-focused ESLint config.
 * Intentionally narrow: only rules that catch real vulnerabilities or dangerous
 * patterns. Non-security style rules live elsewhere (if ever added).
 *
 * 'error'  → blocks CI, must be fixed before merge.
 * 'warn'   → printed in CI output, does NOT block merge but must be reviewed.
 *             Warnings are patterns that are sometimes legitimate (e.g. dynamic
 *             fs paths that are already validated), so they need a human eye.
 */
export default [
  // ── Scope ───────────────────────────────────────────────────────────────
  {
    files: ['server/**/*.js', 'src/**/*.{js,jsx}', 'test/**/*.js'],
    plugins: { security },
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // ── Dynamic code execution (RCE) ──────────────────────────────────
      'no-eval':          'error',
      'no-new-func':      'error',
      'no-implied-eval':  'error',

      // ── Child-process injection ────────────────────────────────────────
      'security/detect-child-process': 'error',

      // ── Dynamic require / import (module injection) ────────────────────
      'security/detect-non-literal-require': 'error',

      // ── ReDoS — crafted input can hang the event loop ──────────────────
      'security/detect-unsafe-regex':        'error',
      'security/detect-non-literal-regexp':  'warn',

      // ── Deprecated Buffer() constructor (has had security quirks) ──────
      'security/detect-new-buffer': 'error',

      // ── crypto.pseudoRandomBytes (insecure PRNG) ────────────────────────
      'security/detect-pseudoRandomBytes': 'error',

      // ── Dynamic filesystem paths (path-traversal risk) ─────────────────
      // Set to warn: several call-sites are already validated upstream.
      // Each occurrence must be reviewed; add eslint-disable with a comment
      // explaining why it is safe rather than silently ignoring.
      'security/detect-non-literal-fs-filename': 'warn',

      // ── Object injection via bracket notation ──────────────────────────
      // Set to warn: obj[variable] is often legitimate (Maps, config lookups).
      'security/detect-object-injection': 'warn',

      // ── Timing-unsafe equality on potentially sensitive values ──────────
      'security/detect-possible-timing-attacks': 'warn',
    },
  },

  // ── Frontend override ────────────────────────────────────────────────────
  // React components use obj[variable] extensively for i18n key lookups,
  // CSS class maps, and canvas draw-calls — none of which are injection risks.
  // Keep the rule active on the server where user input can reach object keys.
  {
    files: ['src/**/*.{js,jsx}'],
    rules: {
      'security/detect-object-injection': 'off',
    },
    linterOptions: {
      // Pre-existing eslint-disable comments in components may reference rules
      // not yet in this config; don't warn about them.
      reportUnusedDisableDirectives: 'off',
    },
  },

  // ── Ignored paths ───────────────────────────────────────────────────────
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
];
