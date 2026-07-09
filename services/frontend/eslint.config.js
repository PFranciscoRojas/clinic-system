import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      'react-hooks/purity': 'error',
      'react-hooks/static-components': 'error',
      'react-hooks/refs': 'error',
      // Ratcheted to 'error' (2026-07-09) after refactoring the legacy effects:
      // derived-state syncs became render-time adjusts / lazy initializers;
      // the few remaining sync-set effects (one-shot restores, fetch-cycle
      // resets) carry a scoped eslint-disable with the reason inline.
      'react-hooks/set-state-in-effect': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  { ignores: ['dist/', 'node_modules/', 'dev-dist/'] },
);
