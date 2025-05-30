import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json'
      },
      globals: {
        ...globals.node,
        ...globals.jest,
        NodeJS: true
      }
    },
    plugins: {
      '@typescript-eslint': typescript
    },
    rules: {
      // TypeScript specific rules
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'off', // Allow any for now
      '@typescript-eslint/no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        ignoreRestSiblings: true
      }],
      '@typescript-eslint/consistent-type-imports': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'off', // Allow ! for now
      
      // General rules
      'no-console': 'off', // Allow console for logging
      'no-debugger': 'error',
      'no-duplicate-imports': 'error',
      'no-unused-vars': 'off', // Using TypeScript's no-unused-vars instead
      'prefer-const': 'error',
      'eqeqeq': ['error', 'always'],
      'curly': ['error', 'all'],
      'comma-dangle': ['error', 'never'],
      'quotes': ['error', 'single'],
      'semi': ['error', 'always'],
      
      // Relaxed rules for this project
      'require-await': 'off',
      'no-empty-function': 'off',
      'consistent-return': 'off',
      'radix': ['error', 'as-needed'],
      'no-implicit-coercion': 'off',
      'no-await-in-loop': 'off',
      
      // Best practices
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-throw-literal': 'error',
      'no-with': 'error',
      'no-void': 'error',
      'array-callback-return': 'error',
      'no-extend-native': 'error',
      'no-iterator': 'error',
      'no-labels': 'error',
      'no-lone-blocks': 'error',
      'no-new-wrappers': 'error',
      'no-proto': 'error',
      'no-self-compare': 'error'
    }
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off'
    }
  },
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '*.config.js',
      '*.config.mjs', 
      '*.config.ts',
      'build/**',
      '.git/**',
      '**/*.d.ts',
      'jest.config.js'
    ]
  }
];