/**
 * Проверки только изменённых файлов перед коммитом (husky pre-commit).
 * @type {import('lint-staged').Configuration}
 */
export default {
  '*.{ts,tsx,mts,cts,js,mjs,cjs}': ['eslint --fix --max-warnings=0 --no-warn-ignored', 'prettier --write'],
  '*.{json,md,yml,yaml,css}': 'prettier --write',
};
