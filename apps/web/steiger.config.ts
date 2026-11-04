import fsd from '@feature-sliced/steiger-plugin';
import { defineConfig } from 'steiger';

export default defineConfig([
  ...fsd.configs.recommended,
  {
    rules: {
      // Слайсы выделены по смыслу (фича = сценарий пользователя), а не по числу потребителей:
      // в небольшом приложении у многих слайсов один потребитель, и сливать их со страницами значит смешать ответственность.
      // Маршруты Next.js лежат вне src/ (корневой app/), поэтому steiger не видит часть ссылок.
      'fsd/insignificant-slice': 'off',
    },
  },
]);
