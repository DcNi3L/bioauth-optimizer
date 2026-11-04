/**
 * Проверка сообщений коммитов (Conventional Commits), запускается хуком husky commit-msg.
 * Формат: <тип>(<область>): <описание>, например «feat(core): сертифицированное ЦЛП».
 * @type {import('@commitlint/types').UserConfig}
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Области — пакеты и сквозные части монорепозитория (AGENTS.md).
    'scope-enum': [
      2,
      'always',
      ['core', 'contracts', 'api', 'web', 'docs', 'ci', 'build', 'deps', 'docker', 'config', 'release'],
    ],
    // Сообщения пишутся по-русски: проверка регистра латиницы к ним неприменима.
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [1, 'always', 120],
    'footer-max-line-length': [1, 'always', 120],
  },
};
