// @ts-check
/**
 * ESLint для всего монорепозитория (flat config).
 * - typescript-eslint strict + stylistic с проверкой типов (projectService находит ближайший tsconfig);
 * - порядок импортов (simple-import-sort);
 * - архитектурные границы из ADR: чистое ядро (ADR-0002), фронтенд без вычислений (ADR-0009);
 * - React, хуки, доступность, Next.js для apps/web; правила Vitest / Jest для тестов;
 * - eslint-config-prettier последним: форматирование — забота Prettier.
 */
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import vitest from '@vitest/eslint-plugin';
import prettier from 'eslint-config-prettier';
import jest from 'eslint-plugin-jest';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const CORE_FORBIDDEN = [
  '@nestjs/*',
  'next',
  'next/*',
  'react',
  'react-dom',
  'kysely',
  'pg',
  'fs',
  'node:fs',
  'node:fs/*',
  '@bioauth/contracts',
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/test-results/**',
      '**/playwright-report/**',
      '**/next-env.d.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'no-duplicate-imports': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      // Индексный доступ с noUncheckedIndexedAccess требует утверждения «!» там, где индекс заведомо в границах.
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // Для логических значений «||» — правильный оператор; ?? нужен там, где возможны null/undefined.
      '@typescript-eslint/prefer-nullish-coalescing': ['error', { ignorePrimitives: { boolean: true } }],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'multi-line'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-param-reassign': 'error',
      'prefer-const': 'error',
      'object-shorthand': 'error',
    },
  },

  // Ядро: только математика, без фреймворков, БД, ФС и источников недетерминизма (ADR-0002, AGENTS.md).
  {
    files: ['packages/optimization-core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: CORE_FORBIDDEN,
              message: 'Ядро не зависит от фреймворков, БД, ФС и контрактов API (ADR-0002).',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'process', message: 'Ядро не читает окружение (ADR-0002).' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Расчёты детерминированы: используйте генератор с явным seed.',
        },
        { object: 'Date', property: 'now', message: 'Время не участвует в расчётах ядра.' },
      ],
    },
  },

  // Бэкенд: классы-модули NestJS и параметры-свойства конструкторов (DI) — штатные приёмы фреймворка.
  {
    files: ['apps/api/src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
    },
  },

  // Фронтенд: React, хуки, доступность, Next.js; вычисления только через API (ADR-0009).
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { react, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y, '@next/next': nextPlugin },
    settings: { react: { version: '19.1' } },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      'react/prop-types': 'off',
      'react/jsx-no-useless-fragment': 'error',
      'react/self-closing-comp': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@bioauth/optimization-core', '@bioauth/optimization-core/*'],
              message: 'Фронтенд не вычисляет: все расчёты идут через API (ADR-0009).',
            },
          ],
        },
      ],
    },
  },

  // Тесты на Vitest (ядро, контракты, фронтенд).
  {
    files: ['packages/*/test/**/*.ts', 'apps/web/src/**/*.test.ts'],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      'vitest/expect-expect': [
        'error',
        { assertFunctionNames: ['expect', 'expectRel', 'expectAbs', 'fc.assert'] },
      ],
    },
  },

  // Тесты API на Jest: supertest возвращает тело как any.
  {
    files: ['apps/api/test/**/*.ts'],
    ...jest.configs['flat/recommended'],
    rules: {
      ...jest.configs['flat/recommended'].rules,
      // supertest: .expect(статус) — тоже проверка
      'jest/expect-expect': ['error', { assertFunctionNames: ['expect', 'request.**.expect', '**.expect'] }],
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
    },
  },

  // У плагина steiger неполные типы — проверяем конфиг без правил no-unsafe-*.
  {
    files: ['apps/web/steiger.config.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },

  // JS-конфиги без информации о типах.
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: globals.node,
      sourceType: 'module',
    },
  },
  { files: ['**/*.cjs', 'apps/api/jest.config.js'], languageOptions: { sourceType: 'commonjs' } },

  prettier,
);
