/**
 * Prettier — единый стиль кода во всём монорепозитории.
 * prettier-plugin-tailwindcss сортирует классы Tailwind в порядке, который рекомендует сам Tailwind.
 * @type {import('prettier').Config}
 */
export default {
  printWidth: 110,
  singleQuote: true,
  trailingComma: 'all',
  semi: true,
  arrowParens: 'always',
  bracketSpacing: true,
  endOfLine: 'lf',
  plugins: ['prettier-plugin-tailwindcss'],
  tailwindStylesheet: './apps/web/src/app/styles/globals.css',
  overrides: [
    { files: '*.md', options: { printWidth: 100, proseWrap: 'preserve' } },
    { files: ['*.yml', '*.yaml'], options: { singleQuote: false } },
  ],
};
