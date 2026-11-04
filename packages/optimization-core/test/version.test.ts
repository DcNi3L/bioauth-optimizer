import { expect, it } from 'vitest';
import pkg from '../package.json';
import { CORE_VERSION } from '../src';

it('CORE_VERSION совпадает с версией пакета', () => {
  expect(CORE_VERSION).toBe(pkg.version);
});
