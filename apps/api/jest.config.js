/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testRegex: '.*\\.test\\.ts$',
  // TS151002 — предупреждение ts-jest о module node16 без isolatedModules; на сборку и проверку типов не влияет.
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json', diagnostics: { ignoreCodes: [151002] } }],
  },
  // Динамический import() в тестах пишется с расширением .js (moduleResolution node16); Jest находит исходный .ts.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  testTimeout: 30000,
};
