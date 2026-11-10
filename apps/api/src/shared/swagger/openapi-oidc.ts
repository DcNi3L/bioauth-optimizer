/**
 * Описание конечных точек OpenID Connect для справочника API. Контроллер OIDC исключён из автогенерации
 * (ответы — по RFC 6749/7662/7009, а не RFC 7807; тела — application/x-www-form-urlencoded), поэтому
 * пути описаны здесь вручную. Проверяется e2e-тестом: каждый путь из обнаружения есть в спецификации.
 */

type Json = Record<string, unknown>;

export const OIDC_TAG = 'Протокол OIDC';

const str = (description: string, extra: Json = {}): Json => ({ type: 'string', description, ...extra });

const oauthError = (description: string, example: Json): Json => ({
  description,
  content: {
    'application/json': { schema: { $ref: '#/components/schemas/OAuthError' }, example },
  },
});

const clientAuth = [{ clientBasic: [] }, {}];

const form = (properties: Json, required: string[], examples: Json): Json => ({
  required: true,
  content: {
    'application/x-www-form-urlencoded': { schema: { type: 'object', properties, required }, examples },
  },
});

export const OIDC_SCHEMAS: Json = {
  OAuthError: {
    type: 'object',
    description: 'Ошибка OAuth 2.0 (RFC 6749 §5.2).',
    required: ['error'],
    properties: {
      error: str('Код ошибки', {
        enum: [
          'invalid_request',
          'invalid_client',
          'invalid_grant',
          'unauthorized_client',
          'unsupported_grant_type',
          'invalid_scope',
          'invalid_token',
          'insufficient_scope',
        ],
      }),
      error_description: str('Пояснение для разработчика'),
    },
  },
  TokenResponse: {
    type: 'object',
    description: 'Ответ конечной точки токенов (RFC 6749 §5.1, OIDC Core §3.1.3.3).',
    required: ['access_token', 'token_type', 'expires_in', 'scope'],
    properties: {
      access_token: str('JWT (RS256) для `Authorization: Bearer`. Проверяется по ключам `/oidc/jwks`.'),
      token_type: str('Всегда `Bearer`', { enum: ['Bearer'] }),
      expires_in: { type: 'integer', description: 'Срок действия access-токена, секунды', example: 600 },
      scope: str('Выданные области через пробел', { example: 'openid profile email' }),
      id_token: str(
        'ID-токен (только при области `openid`). Claims: `sub`, `auth_time`, `nonce`, `amr`, `acr` и данные профиля.',
      ),
      refresh_token: str(
        'Refresh-токен (только при области `offline_access`). Одноразовый: при обмене выдаётся новый, ' +
          'повторное использование старого отзывает всю цепочку.',
      ),
    },
  },
  UserInfo: {
    type: 'object',
    description: 'Claims пользователя. Состав зависит от областей access-токена.',
    required: ['sub'],
    properties: {
      sub: str('Постоянный идентификатор пользователя (UUID)'),
      name: str('Отображаемое имя — область `profile`'),
      preferred_username: str('Логин — область `profile`'),
      picture: str('Адрес аватара — область `profile`'),
      email: str('Почта — область `email`'),
      email_verified: { type: 'boolean', description: 'Почта не подтверждается письмом: всегда `false`' },
      role: str('Роль в BioAuth — область `roles`', {
        enum: ['subject', 'researcher', 'auditor', 'admin'],
      }),
      face_enrolled: { type: 'boolean', description: 'Есть шаблон лица — область `biometrics`' },
      passkeys: { type: 'integer', description: 'Число passkey — область `biometrics`' },
    },
  },
  Introspection: {
    type: 'object',
    description: 'Ответ интроспекции (RFC 7662). Для недействительного токена — только `active: false`.',
    required: ['active'],
    properties: {
      active: { type: 'boolean' },
      token_type: str('`Bearer` для access-токена, `refresh_token` для refresh-токена'),
      scope: str('Области через пробел'),
      client_id: str('Клиент, которому выдан токен'),
      sub: str('Пользователь (или клиент — для client_credentials)'),
      aud: str('Аудитория'),
      iss: str('Издатель'),
      exp: { type: 'integer', description: 'Срок действия, Unix-время' },
      iat: { type: 'integer', description: 'Время выдачи, Unix-время' },
      amr: { type: 'array', items: { type: 'string' }, description: 'Способы проверки (RFC 8176)' },
    },
  },
  Jwks: {
    type: 'object',
    description: 'Набор открытых ключей подписи (RFC 7517).',
    required: ['keys'],
    properties: {
      keys: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            kty: str('Тип ключа', { example: 'RSA' }),
            kid: str('Идентификатор ключа — совпадает с `kid` в заголовке JWT'),
            use: str('Назначение', { example: 'sig' }),
            alg: str('Алгоритм', { example: 'RS256' }),
            n: str('Модуль RSA, base64url'),
            e: str('Открытая экспонента', { example: 'AQAB' }),
          },
        },
      },
    },
  },
};

const tokenProps: Json = {
  grant_type: str('Тип выдачи', { enum: ['authorization_code', 'refresh_token', 'client_credentials'] }),
  code: str('Код авторизации из перенаправления (`authorization_code`). Одноразовый, живёт 60 секунд.'),
  redirect_uri: str('Тот же адрес, что в запросе авторизации (`authorization_code`)'),
  code_verifier: str('Исходная строка PKCE, 43–128 символов (`authorization_code`)'),
  refresh_token: str('Действующий refresh-токен (`refresh_token`)'),
  scope: str('Области через пробел; для `refresh_token` — не шире исходных'),
  client_id: str('Идентификатор клиента — для публичных клиентов и `client_secret_post`'),
  client_secret: str('Секрет — для `client_secret_post` (предпочтительнее HTTP Basic)'),
};

export const OIDC_PATHS: Json = {
  '/.well-known/openid-configuration': {
    get: {
      tags: [OIDC_TAG],
      operationId: 'oidcDiscovery',
      summary: 'Обнаружение (OpenID Connect Discovery 1.0)',
      description:
        'Метаданные сервера авторизации: адреса конечных точек, поддерживаемые области, типы выдачи, ' +
        'алгоритмы и значения `acr`. Клиентские библиотеки настраиваются по одному адресу издателя (`issuer`). ' +
        'Ответ кэшируется на 5 минут.',
      security: [],
      responses: {
        200: {
          description: 'Метаданные издателя',
          content: {
            'application/json': {
              schema: { type: 'object', additionalProperties: true },
              example: {
                issuer: 'http://localhost:3000',
                authorization_endpoint: 'http://localhost:3000/oidc/authorize',
                token_endpoint: 'http://localhost:3000/oidc/token',
                userinfo_endpoint: 'http://localhost:3000/oidc/userinfo',
                jwks_uri: 'http://localhost:3000/oidc/jwks',
                response_types_supported: ['code'],
                grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials'],
                code_challenge_methods_supported: ['S256'],
                id_token_signing_alg_values_supported: ['RS256'],
                scopes_supported: ['openid', 'profile', 'email', 'roles', 'offline_access', 'biometrics'],
              },
            },
          },
        },
      },
    },
  },
  '/oidc/jwks': {
    get: {
      tags: [OIDC_TAG],
      operationId: 'oidcJwks',
      summary: 'Открытые ключи подписи (JWKS)',
      description:
        'Ключи RS256 для проверки подписи ID- и access-токенов. Закрытый ключ хранится в базе в зашифрованном ' +
        'виде (AES-256-GCM). Выбирайте ключ по `kid` из заголовка JWT.',
      security: [],
      responses: {
        200: {
          description: 'Набор ключей',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Jwks' } } },
        },
      },
    },
  },
  '/oidc/authorize': {
    get: {
      tags: [OIDC_TAG],
      operationId: 'oidcAuthorize',
      summary: 'Запрос авторизации (Authorization Code + PKCE)',
      description: [
        'Точка входа для приложения: браузер пользователя перенаправляется сюда. Если пользователь не вошёл — ',
        'открывается вход BioAuth (лицо, passkey или пароль сотрудника), затем экран согласия; после решения ',
        'браузер возвращается на `redirect_uri` с параметрами `code`, `state` и `iss`.',
        '',
        '- PKCE с методом `S256` обязателен для всех клиентов.',
        '- `prompt=none` не показывает интерфейс: без сессии или согласия вернётся `login_required` / `consent_required`.',
        '- `max_age` требует, чтобы вход был не старше указанного числа секунд.',
        '- Ошибки в `client_id` и `redirect_uri` показываются пользователю на странице `/oauth/error` ',
        '(перенаправлять на непроверенный адрес нельзя); остальные — параметром `error` на `redirect_uri`.',
      ].join('\n'),
      security: [],
      parameters: [
        { name: 'response_type', in: 'query', required: true, schema: { type: 'string', enum: ['code'] } },
        {
          name: 'client_id',
          in: 'query',
          required: true,
          schema: { type: 'string' },
          example: 'bioauth-demo',
        },
        {
          name: 'redirect_uri',
          in: 'query',
          required: true,
          description: 'Должен точно совпадать с одним из зарегистрированных адресов клиента.',
          schema: { type: 'string', format: 'uri' },
          example: 'http://localhost:3000/oauth/demo',
        },
        {
          name: 'scope',
          in: 'query',
          required: true,
          description:
            'Области через пробел. `openid` — для ID-токена, `offline_access` — для refresh-токена.',
          schema: { type: 'string' },
          example: 'openid profile email',
        },
        {
          name: 'state',
          in: 'query',
          description: 'Случайная строка клиента: возвращается без изменений (защита от CSRF).',
          schema: { type: 'string' },
        },
        {
          name: 'nonce',
          in: 'query',
          description: 'Случайная строка: попадает в ID-токен (защита от повторного использования).',
          schema: { type: 'string' },
        },
        {
          name: 'code_challenge',
          in: 'query',
          required: true,
          description: '`BASE64URL(SHA256(code_verifier))`',
          schema: { type: 'string', minLength: 43, maxLength: 128 },
        },
        {
          name: 'code_challenge_method',
          in: 'query',
          required: true,
          schema: { type: 'string', enum: ['S256'] },
        },
        {
          name: 'prompt',
          in: 'query',
          description:
            '`login` — войти заново, `consent` — снова спросить согласие, `none` — без интерфейса.',
          schema: { type: 'string', enum: ['none', 'login', 'consent'] },
        },
        {
          name: 'max_age',
          in: 'query',
          description: 'Наибольший допустимый возраст входа, секунды.',
          schema: { type: 'integer', minimum: 0 },
        },
      ],
      responses: {
        302: {
          description:
            'Перенаправление: на вход или согласие в интерфейсе, либо на `redirect_uri` с `code` или `error`.',
          headers: { Location: { schema: { type: 'string', format: 'uri' } } },
        },
      },
    },
  },
  '/oidc/token': {
    post: {
      tags: [OIDC_TAG],
      operationId: 'oidcToken',
      summary: 'Выдача токенов',
      description: [
        'Обмен кода авторизации на токены, обновление по refresh-токену или выдача токена приложению ',
        '(`client_credentials`). Конфиденциальный клиент подтверждает себя HTTP Basic или параметрами тела; ',
        'публичный (SPA, мобильное приложение) передаёт только `client_id` и `code_verifier`.',
        '',
        '**Ротация refresh-токенов.** Каждый обмен выдаёт новый refresh-токен и гасит прежний. Повторное ',
        'предъявление погашенного токена считается кражей: отзывается вся цепочка, клиент получает `invalid_grant`.',
        '',
        'Повторное использование кода авторизации также отзывает токены, выданные по нему. Ответы не кэшируются.',
      ].join('\n'),
      security: clientAuth,
      requestBody: form(tokenProps, ['grant_type'], {
        authorization_code: {
          summary: 'Обмен кода (публичный клиент с PKCE)',
          value: {
            grant_type: 'authorization_code',
            code: 'Zx3…',
            redirect_uri: 'http://localhost:3000/oauth/demo',
            code_verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
            client_id: 'bioauth-demo',
          },
        },
        refresh_token: {
          summary: 'Обновление токенов',
          value: { grant_type: 'refresh_token', refresh_token: 'k3Vq…', client_id: 'bioauth-demo' },
        },
        client_credentials: {
          summary: 'Токен приложения (клиент — в заголовке Basic)',
          value: { grant_type: 'client_credentials', scope: 'roles' },
        },
      }),
      responses: {
        200: {
          description: 'Токены выданы',
          headers: { 'Cache-Control': { schema: { type: 'string', example: 'no-store' } } },
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TokenResponse' },
              example: {
                access_token: 'eyJhbGciOiJSUzI1NiIsImtpZCI6Ii4uLiJ9…',
                token_type: 'Bearer',
                expires_in: 600,
                scope: 'openid profile email',
                id_token: 'eyJhbGciOiJSUzI1NiIsImtpZCI6Ii4uLiJ9…',
              },
            },
          },
        },
        400: oauthError('Запрос отклонён', {
          error: 'invalid_grant',
          error_description: 'код недействителен или уже использован',
        }),
        401: oauthError('Клиент не подтверждён', {
          error: 'invalid_client',
          error_description: 'неверный секрет клиента',
        }),
      },
    },
  },
  '/oidc/userinfo': {
    get: {
      tags: [OIDC_TAG],
      operationId: 'oidcUserinfo',
      summary: 'Сведения о пользователе',
      description:
        'Claims пользователя по access-токену. Состав определяется областями токена: `profile`, `email`, ' +
        '`roles`, `biometrics`. Для отключённой учётной записи токен перестаёт действовать. Допустим и метод POST.',
      security: [{ bearer: [] }],
      responses: {
        200: {
          description: 'Claims пользователя',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UserInfo' },
              example: {
                sub: '5b1d0c0e-6c0a-4a43-9f5e-2f8e0c8d4a11',
                name: 'Айгерим С.',
                preferred_username: 'aigerim',
                email: 'aigerim@example.kz',
                email_verified: false,
              },
            },
          },
        },
        401: oauthError(
          'Токен отсутствует или недействителен (подробности — в заголовке `WWW-Authenticate`)',
          {
            error: 'invalid_token',
            error_description: 'токен недействителен',
          },
        ),
        403: oauthError('В токене нет области `openid`', {
          error: 'insufficient_scope',
          error_description: 'нужна область openid',
        }),
      },
    },
  },
  '/oidc/introspect': {
    post: {
      tags: [OIDC_TAG],
      operationId: 'oidcIntrospect',
      summary: 'Интроспекция токена (RFC 7662)',
      description:
        'Проверка access- или refresh-токена сервером ресурса. Доступна только конфиденциальным клиентам. ' +
        'Для неизвестного, просроченного или отозванного токена возвращается `{"active": false}` без подробностей.',
      security: [{ clientBasic: [] }],
      requestBody: form({ token: str('Проверяемый токен') }, ['token'], {
        default: { value: { token: 'eyJhbGciOiJSUzI1NiIs…' } },
      }),
      responses: {
        200: {
          description: 'Состояние токена',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Introspection' },
              examples: {
                active: {
                  value: {
                    active: true,
                    token_type: 'Bearer',
                    scope: 'openid profile',
                    client_id: 'bioauth-demo',
                    sub: '5b1d0c0e-6c0a-4a43-9f5e-2f8e0c8d4a11',
                    exp: 1794300000,
                    amr: ['face', 'hwk'],
                  },
                },
                inactive: { value: { active: false } },
              },
            },
          },
        },
        401: oauthError('Клиент не подтверждён', {
          error: 'invalid_client',
          error_description: 'интроспекция только для конфиденциальных клиентов',
        }),
      },
    },
  },
  '/oidc/revoke': {
    post: {
      tags: [OIDC_TAG],
      operationId: 'oidcRevoke',
      summary: 'Отзыв токена (RFC 7009)',
      description:
        'Отзывает refresh-токен вместе со всей его цепочкой. Ответ `200` и для неизвестного токена — так требует ' +
        'RFC 7009. Access-токены короткоживущие (10 минут) и до истечения срока остаются действительными.',
      security: clientAuth,
      requestBody: form(
        { token: str('Отзываемый refresh-токен'), client_id: str('Для публичного клиента') },
        ['token'],
        { default: { value: { token: 'k3Vq…', client_id: 'bioauth-demo' } } },
      ),
      responses: {
        200: {
          description: 'Токен отозван или не существовал',
          content: { 'application/json': { schema: { type: 'object' }, example: {} } },
        },
        401: oauthError('Клиент не подтверждён', {
          error: 'invalid_client',
          error_description: 'неизвестный клиент',
        }),
      },
    },
  },
  '/oidc/logout': {
    get: {
      tags: [OIDC_TAG],
      operationId: 'oidcLogout',
      summary: 'Выход по запросу приложения (RP-Initiated Logout 1.0)',
      description: [
        'Завершает сессию пользователя в BioAuth и возвращает браузер в приложение.',
        '',
        '- С действительным `id_token_hint` текущего пользователя выход выполняется сразу.',
        '- Без него (или если токен выдан другому пользователю) открывается страница подтверждения ',
        '`/oauth/logout`: так сторонний сайт не может разлогинить пользователя ссылкой.',
        '- `post_logout_redirect_uri` принимается, только если зарегистрирован у клиента; иначе браузер ',
        'остаётся в интерфейсе BioAuth.',
      ].join('\n'),
      security: [],
      parameters: [
        {
          name: 'id_token_hint',
          in: 'query',
          description: 'Ранее выданный ID-токен (может быть просроченным).',
          schema: { type: 'string' },
        },
        { name: 'client_id', in: 'query', schema: { type: 'string' } },
        { name: 'post_logout_redirect_uri', in: 'query', schema: { type: 'string', format: 'uri' } },
        {
          name: 'state',
          in: 'query',
          description: 'Возвращается на `post_logout_redirect_uri`.',
          schema: { type: 'string' },
        },
      ],
      responses: {
        302: {
          description: 'Перенаправление в приложение или на страницу подтверждения выхода',
          headers: { Location: { schema: { type: 'string', format: 'uri' } } },
        },
      },
    },
  },
};
