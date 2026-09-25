import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '.tmp', 'test-results', 'playwright-report']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  { files: ['vite.config.js', '**/*.mjs'], languageOptions: { globals: globals.node } },
  { files: ['public/background-sync.js'], languageOptions: { globals: globals.serviceworker } },
  { files: ['src/lib/context.jsx'], rules: { 'react-refresh/only-export-components': ['error', { allowExportNames: ['useApp', 'useData'] }] } },
])
