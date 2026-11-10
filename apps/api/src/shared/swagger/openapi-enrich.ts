import { problemDetailsSchema } from '@bioauth/contracts';
import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';

import { zodToOpenApi } from './api-zod';
import { collectAccess, type RouteAccess } from './openapi-access';
import { OPERATIONS, TAG_GROUPS, TAGS } from './openapi-catalog';
import { OIDC_PATHS, OIDC_SCHEMAS } from './openapi-oidc';

type Json = Record<string, unknown>;

const PREFIX = '/api/v1';
const TYPE_BASE = 'https://bioauth-optimizer/errors/';

const ROLE_NAMES: Record<string, string> = {
  admin: 'администратор',
  researcher: 'исследователь',
  auditor: 'аудитор',
  subject: 'субъект',
};

const problem = (status: number, type: string, title: string, detail: string, extra: Json = {}): Json => ({
  type: TYPE_BASE + type,
  title,
  status,
  detail,
  instance: '/api/v1/…',
  requestId: '6f1c2f0e-3a55-4c0e-9b1d-0d6a1f3f7c21',
  ...extra,
});

/** Общие ответы об ошибках (RFC 7807): на них ссылаются все операции REST API. */
const RESPONSES: Record<string, { description: string; example: Json }> = {
  BadRequest: {
    description: 'Некорректные входные данные. Поле `errors` перечисляет нарушения по путям в теле запроса.',
    example: problem(
      400,
      'validation-error',
      'Некорректные входные данные',
      'costs.cFa: должно быть больше 0',
      {
        errors: [{ path: 'costs.cFa', message: 'должно быть больше 0' }],
      },
    ),
  },
  Unauthorized: {
    description: 'Нужен вход: нет cookie сессии или сессия истекла.',
    example: problem(401, 'unauthorized', 'Нужен вход', 'нужен вход'),
  },
  Forbidden: {
    description:
      'Доступ запрещён: недостаточно прав, не завершён двухфакторный вход или запрос пришёл с чужого источника.',
    example: problem(403, 'forbidden', 'Доступ запрещён', 'недостаточно прав'),
  },
  NotFound: {
    description: 'Объект не найден.',
    example: problem(404, 'not-found', 'Не найдено', 'объект не найден'),
  },
  Conflict: {
    description: 'Конфликт с текущим состоянием.',
    example: problem(409, 'conflict', 'Конфликт', 'объект уже изменён'),
  },
  PayloadTooLarge: {
    description: 'Запрос или задача слишком велики.',
    example: problem(413, 'problem-too-large', 'Задача слишком велика для выбранного метода', 'факторов: 40'),
  },
  Unprocessable: {
    description: 'Запрос корректен, но не может быть выполнен. Поле `code` уточняет причину.',
    example: problem(
      422,
      'unprocessable',
      'Запрос не может быть выполнен',
      'годных кадров 1, нужно не менее 3',
      {
        code: 'FACE_QUALITY',
        frames: [{ issues: ['BLURRY'] }, { issues: [] }, { issues: ['NO_FACE'] }],
      },
    ),
  },
  TooManyRequests: {
    description:
      'Превышена частота запросов или вход временно заблокирован после серии неудач (`lockedUntil`).',
    example: problem(429, 'too-many-attempts', 'Слишком много попыток', 'вход временно заблокирован', {
      lockedUntil: '2026-11-10T09:15:00.000Z',
    }),
  },
  ServiceUnavailable: {
    description: 'Зависимость недоступна (база данных или сервис распознавания). Повторите запрос позже.',
    example: problem(503, 'service-unavailable', 'Сервис недоступен', 'сервис распознавания недоступен'),
  },
};

const BY_STATUS: Record<number, string> = {
  400: 'BadRequest',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'NotFound',
  409: 'Conflict',
  413: 'PayloadTooLarge',
  422: 'Unprocessable',
  429: 'TooManyRequests',
  503: 'ServiceUnavailable',
};

const DESCRIPTION = `
Сервер биометрической аутентификации **BioAuth Optimizer**: расчёт оптимального порога и состава факторов
(формулы 1–3 статьи СРО1), регистрация и вход по лицу с активной проверкой «живости» и passkey, калибровка
порогов по реальным попыткам, учётные записи, админ-панель и сервер авторизации OpenID Connect.

## Быстрый старт

Расчётные методы открыты без входа — их можно вызвать сразу:

\`\`\`bash
curl -s http://localhost:3000/api/v1/examples/sro1 | jq .threshold > body.json
curl -s -X POST http://localhost:3000/api/v1/threshold/optimize \\
  -H 'content-type: application/json' -d @body.json | jq '{tau: .optimal.tau, far: .optimal.far, frr: .optimal.frr}'
\`\`\`

Кнопка **Test Request** у каждой операции отправляет запрос с этой страницы. Если вы вошли в интерфейс
в этом же браузере, cookie сессии подставится автоматически.

## Аутентификация

| Способ | Где применяется | Как получить |
| --- | --- | --- |
| Cookie \`bioauth_session\` (httpOnly, SameSite=Lax) | Весь REST API \`/api/v1\` | \`POST /identity/login\` или вход по лицу \`/auth/sessions\` |
| \`Authorization: Bearer <access_token>\` | \`/oidc/userinfo\` | \`POST /oidc/token\` |
| HTTP Basic \`client_id:client_secret\` | \`/oidc/token\`, \`/oidc/introspect\`, \`/oidc/revoke\` | Регистрация клиента в админ-панели |

У каждой операции указано, кому она доступна: без входа, любому вошедшему пользователю или перечисленным ролям
(\`subject\`, \`researcher\`, \`auditor\`, \`admin\`). Пометка «двухфакторный вход» означает, что сотрудник
должен подтвердить вход passkey.

**Защита от CSRF.** Изменяющий запрос с cookie сессии принимается только с адреса интерфейса: запрос с чужим
заголовком \`Origin\` отклоняется с \`403\`.

## Ошибки

REST API отвечает в формате [RFC 7807](https://www.rfc-editor.org/rfc/rfc7807) \`application/problem+json\`.
Поле \`type\` — постоянный идентификатор вида ошибки, \`requestId\` — номер запроса в журнале сервера.

| Статус | \`type\` (окончание) | Когда |
| --- | --- | --- |
| 400 | \`validation-error\` | Тело или параметры не прошли проверку; подробности — в \`errors[]\` |
| 401 | \`unauthorized\` | Нет сессии |
| 403 | \`forbidden\` | Недостаточно прав, нет согласия, не завершён двухфакторный вход |
| 404 | \`not-found\` | Объекта нет |
| 409 | \`conflict\` | Состояние уже изменено, логин занят |
| 413 | \`problem-too-large\` | Задача слишком велика для выбранного метода |
| 422 | \`infeasible-problem\`, \`unprocessable\` | Нет допустимых решений; кадры не годятся (\`code\`, \`frames[]\`) |
| 429 | \`too-many-attempts\` | Частота запросов или блокировка входа (\`lockedUntil\`) |
| 503 | \`service-unavailable\` | Недоступна база или сервис распознавания |

Конечные точки OpenID Connect отвечают по RFC 6749: \`{"error": "...", "error_description": "..."}\`.

## Ограничение частоты

Запросы ограничены по адресу клиента. Для входа и регистрации пределы строже — они указаны в описании
операции. При превышении — \`429\`.

## Соглашения

- Время — ISO 8601 в UTC; идентификаторы — UUID.
- Вероятности и доли (FAR, FRR, оценки сходства) — числа от 0 до 1, не проценты.
- Изображения — JPEG или PNG в base64 (допустим префикс \`data:\`), метки времени кадров — миллисекунды.
- Списки с большим числом записей используют keyset-пагинацию: параметр \`cursor\` из предыдущего ответа.
- Версия API — в пути (\`/api/v1\`); версия сервера — в поле \`info.version\` этой спецификации.
`.trim();

function accessNote(a: RouteAccess): string {
  const parts: string[] = [];
  if (a.public) parts.push('**Доступ:** без входа.');
  else if (a.roles)
    parts.push(
      `**Доступ:** ${a.roles.map((r) => `${ROLE_NAMES[r] ?? r} (\`${r}\`)`).join(', ')}${a.mfa ? ' · двухфакторный вход' : ''}.`,
    );
  else parts.push(`**Доступ:** любой вошедший пользователь${a.mfa ? ' · двухфакторный вход' : ''}.`);
  if (a.perMinute !== null)
    parts.push(`**Частота:** не более ${a.perMinute} запросов в минуту с одного адреса.`);
  return parts.join(' ');
}

const ref = (name: string): Json => ({ $ref: `#/components/responses/${name}` });

/** camelCase-идентификатор операции: IdentityController_login → identityLogin. */
const operationId = (id: string): string => {
  const [controller = '', method = ''] = id.split('_');
  const base = controller.replace(/Controller$/, '');
  return base.charAt(0).toLowerCase() + base.slice(1) + method.charAt(0).toUpperCase() + method.slice(1);
};

/**
 * Дополняет спецификацию, собранную @nestjs/swagger: схемы безопасности и требования доступа по тем же
 * метаданным, что читает AuthGuard; общие ответы об ошибках RFC 7807; описания разделов и их группы;
 * примеры запросов; конечные точки OpenID Connect, исключённые из автогенерации.
 */
export function enrichOpenApi(app: INestApplication, doc: OpenAPIObject, issuer: string): OpenAPIObject {
  const access = collectAccess(app);
  const out = doc as unknown as Json & { paths: Record<string, Record<string, Json>>; components?: Json };

  out.info = {
    ...(out.info as Json),
    description: DESCRIPTION,
    contact: { name: 'Даниэль Мекенбаев', url: 'https://github.com/DcNi3L/bioauth-optimizer' },
  };
  out.externalDocs = {
    description: 'Документация проекта: требования, архитектура, протокол испытаний',
    url: 'https://github.com/DcNi3L/bioauth-optimizer/tree/main/docs',
  };
  out.servers = [
    { url: '/', description: 'Этот сервер' },
    { url: issuer, description: 'Адрес интерфейса (издатель OpenID Connect)' },
  ];
  out.tags = TAGS;
  out['x-tagGroups'] = TAG_GROUPS;

  const components = (out.components ??= {});
  components.schemas = {
    ...(components.schemas as Json | undefined),
    ...OIDC_SCHEMAS,
    Problem: {
      ...zodToOpenApi(problemDetailsSchema, 'output'),
      description: 'Ошибка REST API в формате RFC 7807.',
    },
  };
  components.responses = Object.fromEntries(
    Object.entries(RESPONSES).map(([name, r]) => [
      name,
      {
        description: r.description,
        content: {
          'application/problem+json': {
            schema: { $ref: '#/components/schemas/Problem' },
            example: r.example,
          },
        },
      },
    ]),
  );
  components.securitySchemes = {
    cookieAuth: {
      type: 'apiKey',
      in: 'cookie',
      name: 'bioauth_session',
      description:
        'Сессия интерфейса. Cookie выставляется после `POST /api/v1/identity/login` или входа по лицу; ' +
        'в браузере подставляется автоматически.',
    },
    bearer: {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Access-токен OpenID Connect, выданный `/oidc/token`.',
    },
    clientBasic: {
      type: 'http',
      scheme: 'basic',
      description: 'Учётные данные клиента OAuth: `client_id` — имя, `client_secret` — пароль.',
    },
    oidc: {
      type: 'oauth2',
      description: 'Authorization Code с PKCE (S256). Для пробы — публичный клиент `bioauth-demo`.',
      flows: {
        authorizationCode: {
          authorizationUrl: `${issuer}/oidc/authorize`,
          tokenUrl: `${issuer}/oidc/token`,
          refreshUrl: `${issuer}/oidc/token`,
          'x-usePkce': 'SHA-256',
          scopes: {
            openid: 'Идентификатор пользователя и ID-токен',
            profile: 'Имя, логин, аватар',
            email: 'Почта',
            roles: 'Роль в BioAuth',
            offline_access: 'Refresh-токен',
            biometrics: 'Наличие шаблона лица и passkey',
          },
        },
      },
    },
  };

  for (const [path, methods] of Object.entries(out.paths)) {
    const local = path.startsWith(PREFIX) ? path.slice(PREFIX.length) : path;
    for (const [method, op] of Object.entries(methods)) {
      const key = `${method} ${local}`;
      const a = access.get(key);
      const extra = OPERATIONS[key];
      if (typeof op.operationId === 'string') op.operationId = operationId(op.operationId);
      if (extra?.summary && !op.summary) op.summary = extra.summary;

      const description = [op.description as string | undefined, extra?.description, a && accessNote(a)]
        .filter(Boolean)
        .join('\n\n');
      if (description) op.description = description;

      const responses = (op.responses ??= {}) as Record<string, Json>;
      if (extra?.ok) {
        const success = Object.keys(responses).find((c) => c.startsWith('2')) ?? '200';
        responses[success] = {
          description: 'Успешный ответ',
          ...responses[success],
          content: { 'application/json': { schema: zodToOpenApi(extra.ok, 'output') } },
        };
      }
      for (const [code, r] of Object.entries(responses))
        if (code.startsWith('2') && !r.description)
          r.description = code === '204' ? 'Выполнено, тела ответа нет' : 'Успешный ответ';

      const statuses = new Set<number>();
      const body = op.requestBody as { content?: Record<string, Json> } | undefined;
      if (body || (op.parameters as unknown[] | undefined)?.length) statuses.add(400);
      if (a && !a.public) {
        statuses.add(401);
        statuses.add(403);
      }
      if (path.includes('{')) statuses.add(404);
      if (a && a.perMinute !== null) statuses.add(429);
      for (const code of Object.keys(extra?.errors ?? {})) statuses.add(Number(code));
      for (const status of [...statuses].sort((x, y) => x - y)) {
        const name = BY_STATUS[status];
        if (!name || responses[String(status)]) continue;
        const why = extra?.errors?.[status];
        // Своя причина — отдельный ответ с тем же телом; иначе — ссылка на общий.
        responses[String(status)] = why
          ? { ...(components.responses as Record<string, Json>)[name], description: why }
          : ref(name);
      }

      if (a) {
        op.security = a.public ? [] : [{ cookieAuth: [] }];
        op['x-access'] = { public: a.public, roles: a.roles, mfa: a.mfa, perMinute: a.perMinute };
      }
      const json = body?.content?.['application/json'];
      if (extra?.example !== undefined && json) json.example = extra.example;
    }
  }

  Object.assign(out.paths, OIDC_PATHS);
  return out as unknown as OpenAPIObject;
}
