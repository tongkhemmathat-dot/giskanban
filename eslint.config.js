import js from '@eslint/js';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
  {
    ignores: ['node_modules/**', 'data/**', 'coverage/**', 'public/mockup.html', '.claude/worktrees/**'],
  },
  js.configs.recommended,
  {
    // server + tooling + tests: Node.js ESM environment
    files: ['server/**/*.js', 'tests/**/*.js', 'api/**/*.js', '*.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // frontend: Vanilla JS loaded via <script> in the browser (no bundler)
    files: ['public/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        // loaded via CDN <script> tags, no bundler/npm package per CLAUDE.md
        Sortable: 'readonly',
        Chart: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  eslintConfigPrettier,
];
