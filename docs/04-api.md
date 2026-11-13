# 04. REST API

Базовый путь — `/api/v1`, формат JSON. Справочник API — **Scalar** (`GET /api/docs`, ADR-0019), спецификация OpenAPI 3 — `GET /api/openapi.json`
(прежний адрес `/api/docs-json` сохранён); она генерируется из zod-схем `@bioauth/contracts` через `@nestjs/swagger` и дополняется (`apps/api/src/shared/swagger/openapi-*.ts`): требования доступа и ограничения частоты берутся из тех же декораторов, что читает охранник (`x-access`, `security`), добавляются общие ответы об ошибках RFC 7807, описания и группы разделов (`x-tagGroups`), примеры запросов и конечные точки OpenID Connect. Числа передаются как IEEE 754 double без округления; форматирует их только UI.

## 4.1. Сводка эндпоинтов

| Метод              | Путь                                | Назначение                                                                  |
| ------------------ | ----------------------------------- | --------------------------------------------------------------------------- |
| POST               | `/threshold/optimize`               | Оптимальный порог (параметрический режим или по сохранённому набору оценок) |
| POST               | `/score-datasets`                   | Загрузка CSV с оценками (multipart, поле `file`)                            |
| GET                | `/score-datasets/:id`               | Метаданные набора (n_G, n_I, min/max, гистограмма)                          |
| POST               | `/factor-selection/solve`           | Оптимальный состав факторов                                                 |
| POST               | `/factor-selection/budget-sweep`    | Анализ чувствительности к бюджету                                           |
| GET / POST         | `/factor-catalogs`                  | Список / создание каталога факторов                                         |
| GET / PUT / DELETE | `/factor-catalogs/:id`              | Чтение / замена / удаление каталога                                         |
| GET                | `/experiments?type=&limit=&cursor=` | История (keyset-пагинация по `created_at, id`)                              |
| GET                | `/experiments/:id`                  | Полный эксперимент (вход + результат)                                       |
| GET                | `/examples/sro1`                    | Пресеты модельного примера статьи СРО1                                      |
| GET                | `/health/live`, `/health/ready`     | Проверки живости / готовности (ready проверяет БД)                          |

## 4.2. `POST /threshold/optimize`

**Запрос (параметрический режим, пример статьи):**

```json
{
  "model": {
    "kind": "gaussian",
    "genuine": { "mean": 0.72, "std": 0.09 },
    "impostor": { "mean": 0.3, "std": 0.11 }
  },
  "costs": { "cFA": 10, "cFR": 1 },
  "constraints": { "farMax": null },
  "curve": { "points": 200, "from": 0.3, "to": 0.8 }
}
```

Эмпирический режим: `"model": { "kind": "empirical", "datasetId": "…uuid…" }`.

**Валидация:** std > 0; genuine.mean > impostor.mean; cFA, cFR > 0; farMax ∈ (0, 1) или null; points ∈ [10, 2000].

**Ответ 200:**

```json
{
  "experimentId": "0f6c…",
  "eer": {
    "tau": 0.531,
    "far": 0.017864420562817,
    "frr": 0.017864420562817,
    "cost": 0.196508626190982
  },
  "optimal": {
    "tau": 0.581785716220834,
    "far": 0.00520823745159,
    "frr": 0.062304237539322,
    "cost": 0.114386612055219,
    "interval": null,
    "degenerate": null
  },
  "lossReduction": 0.41790539,
  "verification": { "status": "ok", "numericTau": 0.581785716221, "absDiff": 3.1e-12 },
  "warnings": [],
  "curves": {
    "errors": [{ "tau": 0.3, "far": 0.5, "frr": 1.5e-6, "cost": 5.0000015 }],
    "roc": [{ "far": 0.5, "tar": 0.9999985 }]
  },
  "meta": { "coreVersion": "1.0.0", "durationMs": 3 }
}
```

В эмпирическом режиме `optimal.interval = [t_{k−1}, t_k]`, а `optimal.tau` — середина интервала.

## 4.3. `POST /factor-selection/solve`

**Запрос (пример статьи):**

```json
{
  "factors": [
    {
      "code": "F1",
      "name": "Лицо (ArcFace) + PAD",
      "far": 1e-4,
      "frr": 0.02,
      "latencyMs": 350,
      "cost": 1.0,
      "hasPad": true
    },
    {
      "code": "F2",
      "name": "Отпечаток пальца",
      "far": 5e-5,
      "frr": 0.015,
      "latencyMs": 250,
      "cost": 0.6,
      "hasPad": true
    },
    {
      "code": "F3",
      "name": "Голос",
      "far": 5e-3,
      "frr": 0.06,
      "latencyMs": 900,
      "cost": 0.4,
      "hasPad": false
    },
    {
      "code": "F4",
      "name": "Поведенческая биометрия",
      "far": 2e-2,
      "frr": 0.05,
      "latencyMs": 60,
      "cost": 0.3,
      "hasPad": false
    },
    {
      "code": "F5",
      "name": "Аутентификатор FIDO2",
      "far": 1e-6,
      "frr": 0.005,
      "latencyMs": 400,
      "cost": 1.5,
      "hasPad": false
    }
  ],
  "costs": { "cFA": 10, "cFR": 1 },
  "constraints": { "latencyMaxMs": 1000, "budget": 2.5, "farMax": 1e-6, "minPadFactors": 1 },
  "fusionRule": "AND",
  "solver": "auto",
  "rankingLimit": 100
}
```

Вместо `factors` можно передать `"catalogId": "…"`.

**Валидация:** 1 ≤ n ≤ 50; коды уникальны; far ∈ (0,1); frr ∈ [0,1); latencyMs, cost ≥ 0; `solver = "exhaustive"` требует n ≤ 20 (иначе 413 `problem-too-large`).

**Ответ 200:**

```json
{
  "experimentId": "7a1d…",
  "status": "optimal",
  "optimum": {
    "codes": ["F2", "F5"],
    "far": 5.0e-11,
    "frr": 0.019925,
    "latencyMs": 650,
    "cost": 2.1,
    "padCount": 1,
    "objective": 0.0199250005,
    "activeConstraints": ["minPadFactors"],
    "slack": { "latencyMs": 350, "budget": 0.4, "logFar": -6.908, "minPadFactors": 0 }
  },
  "ranking": [
    {
      "rank": 1,
      "codes": ["F2", "F5"],
      "objective": 0.019925,
      "far": 5.0e-11,
      "frr": 0.019925,
      "latencyMs": 650,
      "cost": 2.1
    },
    {
      "rank": 2,
      "codes": ["F1", "F5"],
      "objective": 0.0249,
      "far": 1.0e-10,
      "frr": 0.0249,
      "latencyMs": 750,
      "cost": 2.5
    }
  ],
  "rankingComplete": true,
  "stats": {
    "subsetsTotal": 31,
    "feasibleCount": 6,
    "rejectedBy": { "latency": 15, "budget": 8, "pad": 7, "far": 6 }
  },
  "solver": { "used": "exhaustive", "certificate": null },
  "meta": { "coreVersion": "1.0.0", "durationMs": 1 }
}
```

Для `ilp`: `"solver": { "used": "ilp", "certificate": { "iterations": 2, "lowerBound": 0.068929, "bestObjective": 0.019925, "proven": true } }`, `rankingComplete: false`.

Если допустимых наборов нет — **422** `infeasible-problem` с полем `rejectedBy` (сколько подмножеств отсекло каждое ограничение; одно подмножество может нарушать несколько).

## 4.4. `POST /factor-selection/budget-sweep`

Запрос — как в `/solve`, но вместо `constraints.budget` передаётся `"sweep": { "from": 0.5, "to": 3.0, "step": 0.1 }` (не более 500 точек).

```json
{
  "points": [
    { "budget": 2.0, "codes": ["F1", "F2"], "objective": 0.0347 },
    { "budget": 2.1, "codes": ["F2", "F5"], "objective": 0.019925 }
  ],
  "breakpoints": [
    { "budget": 0.9, "codes": ["F2", "F4"], "objective": 0.06426 },
    { "budget": 1.6, "codes": ["F1", "F2"], "objective": 0.0347, "ratioToPrevious": 0.54 },
    { "budget": 2.1, "codes": ["F2", "F5"], "objective": 0.019925, "ratioToPrevious": 0.574 }
  ]
}
```

## 4.5. API v2: живая биометрия и замкнутый контур

v2 закрыт по умолчанию: глобальная проверка сессии (cookie `bioauth_session`, httpOnly, SameSite=Lax), роли
(`subject`, `admin`, `researcher`, `auditor`) и требование двухфакторного входа для изменений политик (ADR-0016).
Эндпоинты v1 из §4.1 остаются открытыми (`@Public`). Для запросов с cookie, меняющих состояние, проверяется заголовок
`Origin` (защита от CSRF). Полные схемы — в справочнике Scalar (`/api/docs`).

| Метод        | Путь                                        | Доступ                     | Назначение                                                             |
| ------------ | ------------------------------------------- | -------------------------- | ---------------------------------------------------------------------- |
| POST         | `/identity/subjects`                        | открыт                     | Регистрация субъекта (логин, имя) — сразу открывает сессию             |
| POST         | `/identity/login`                           | открыт                     | Вход сотрудника по паролю (первый фактор)                              |
| POST         | `/identity/logout`                          | открыт                     | Выход                                                                  |
| GET          | `/identity/viewer`                          | —                          | То же для интерфейса: `{ user: … \| null }` без ошибки 401             |
| GET          | `/identity/me`                              | сессия                     | Текущий пользователь: роль, согласие, шаблон, passkey, MFA             |
| GET          | `/consent/text`                             | открыт                     | Текст согласия на обработку биометрии                                  |
| POST, DELETE | `/consent`                                  | сессия                     | Дать согласие / отозвать (удаляет биометрию)                           |
| POST, DELETE | `/enrollment/face`                          | субъект, согласие          | Регистрация лица по 5 кадрам / удаление шаблона                        |
| POST         | `/webauthn/register/options`, `/verify`     | сессия                     | Регистрация passkey                                                    |
| GET, DELETE  | `/webauthn/credentials[/:id]`               | сессия                     | Свои passkey                                                           |
| POST         | `/webauthn/staff/options`, `/verify`        | сотрудник                  | Второй фактор сотрудника                                               |
| POST         | `/auth/sessions`                            | открыт                     | Начать вход субъекта: шаги политики, nonce, случайные команды          |
| POST         | `/auth/sessions/:id/face`                   | открыт                     | Кадры лица: нейтральные + по шагам команд → решение                    |
| POST         | `/auth/sessions/:id/passkey/*`              | открыт                     | Второй шаг: options / verify / cancel                                  |
| GET          | `/policies[/:id]`                           | admin, researcher, auditor | Версии политики                                                        |
| POST         | `/policies`                                 | admin, researcher + MFA    | Предложить версию                                                      |
| POST         | `/policies/:id/approve` `reject` `rollback` | admin + MFA                | Решение (утверждает не автор предложения)                              |
| GET          | `/audit/events`, `/audit/verify`            | admin, auditor             | Журнал аудита; проверка цепочки хэшей                                  |
| GET          | `/audit/export`                             | admin, auditor             | Выгрузка CSV/JSON (`from`, `to`, `action`), заголовки проверки цепочки |
| GET          | `/calibration/overview`                     | admin, researcher, auditor | Накопленные оценки по версиям моделей, действующая политика, дрейф     |
| POST         | `/calibration/threshold`                    | admin, researcher          | Калибровка τ_face / τ_pad ядром v1 + проверка достаточности            |
| POST         | `/calibration/propose`                      | admin, researcher + MFA    | Политика из экспериментов калибровки                                   |
| GET          | `/calibration/factors`                      | admin, researcher, auditor | Измеренные характеристики факторов                                     |
| POST         | `/calibration/factors/catalog`              | admin, researcher          | Каталог факторов из измерений для решателя v1                          |
| GET          | `/calibration/report`                       | admin, researcher, auditor | Протокол §10.11: «до/после калибровки» с интервалами                   |
| POST         | `/calibration/drift/check`                  | admin, researcher          | Проверить дрейф FRR сейчас (обычно по расписанию)                      |
| POST         | `/calibration/drift/:id/acknowledge`        | admin                      | Принять уведомление о дрейфе                                           |
| POST, GET    | `/calibration/batch[/:id]`                  | admin, researcher          | Пакетный режим: zip → набор оценок (фоновая задача)                    |
| GET, DELETE  | `/calibration/batch/:id/csv`, `/:id`        | admin, researcher          | CSV оценок / отмена задачи                                             |
| POST         | `/pad-test/samples`                         | admin, researcher          | Испытание PAD: подлинное предъявление или атака                        |
| GET          | `/pad-test/report?threshold=`               | admin, researcher, auditor | APCER по видам атак, BPCER                                             |
| GET          | `/attempts`                                 | admin, researcher, auditor | Журнал попыток (keyset-пагинация); аудитору оценки не показываются     |

Внутренний сервис bio-engine (`/v1/face/*`, `/v1/batch/face`) доступен только из сети docker compose по общему
секрету `X-Bio-Secret`; его контракт описан в `services/bio-engine/README.md` и `packages/contracts/src/bio-engine.ts`.

## 4.6. Формат ошибок (RFC 7807)

```json
{
  "type": "https://bioauth-optimizer/errors/validation-error",
  "title": "Некорректные входные данные",
  "status": 400,
  "detail": "genuine.mean должно быть больше impostor.mean",
  "instance": "/api/v1/threshold/optimize",
  "requestId": "c0a8…",
  "errors": [{ "path": "model.genuine.mean", "message": "должно быть больше impostor.mean" }]
}
```

Коды ответов v2 дополнительно используют `401` (нет сессии), `403` (роль, MFA или Origin), `409` (конфликт версии
модели, уже выполняется задача), `413` (размер), `422` с машинным полем `code` (например, качество кадров — с массивом
`frames`) и `429` (блокировка после неудачных попыток, поле `lockedUntil`).

## 4.7. API v3: учётная запись, админ-панель, OpenID Connect

**Учётная запись** (нужен вход):

| Метод и путь                                       | Назначение                                                              |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| `PATCH /identity/me`                               | Имя и почта (`email: null` — удалить); 409 — почта занята               |
| `PUT /identity/me/avatar`, `DELETE …`              | Аватар: data URL PNG/JPEG/WebP до 1 МБ, формат проверяется по сигнатуре |
| `GET /avatars/{userId}` (открыт)                   | Изображение аватара с ETag; на него ссылается claim `picture`           |
| `GET /identity/sessions`                           | Сессии: устройство (браузер, ОС, тип), IP, `amr`, текущая               |
| `DELETE /identity/sessions/{id}`                   | Завершить другую сессию (текущую завершает выход)                       |
| `POST /identity/sessions/revoke-others`            | Завершить все, кроме текущей                                            |
| `GET /identity/login-history?limit=`               | Входы и отказы с причиной, устройством и приложением                    |
| `GET /oauth/apps`, `DELETE /oauth/apps/{clientId}` | Подключённые приложения; отключение отзывает согласие и refresh-токены  |

**Админ-панель** (роли `admin`, `auditor`; изменения — `admin` с MFA):

| Метод и путь                                              | Назначение                                                                          |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `GET /admin/stats`                                        | Пользователи, сессии, входы за 14 дней, способы, причины отказов, приложения        |
| `GET /admin/users?q&role&status`                          | Поиск и фильтры, постранично                                                        |
| `POST /admin/users`                                       | Создать сотрудника (пароль ≥ 12 символов)                                           |
| `GET /admin/users/{id}`                                   | Карточка: сессии, история, разрешения приложениям                                   |
| `PATCH /admin/users/{id}`                                 | Роль, отключение, снятие блокировки; нельзя менять себя и последнего администратора |
| `DELETE /admin/users/{id}/sessions`                       | Завершить все сессии пользователя                                                   |
| `GET /admin/login-events?failures`                        | Журнал входов всех пользователей                                                    |
| `GET/POST/PATCH/DELETE /admin/oauth-clients[/{clientId}]` | Клиенты OAuth; секрет показывается один раз, `rotateSecret` выпускает новый         |

**OpenID Connect** (без префикса `/api/v1`, ответы об ошибках — RFC 6749):

| Метод и путь                                      | Назначение                                                                        |
| ------------------------------------------------- | --------------------------------------------------------------------------------- |
| `GET /.well-known/openid-configuration`           | Документ обнаружения                                                              |
| `GET /oidc/jwks`                                  | Открытые ключи RS256                                                              |
| `GET /oidc/authorize`                             | Код авторизации; PKCE S256 обязателен для публичных клиентов; `prompt`, `max_age` |
| `GET /oidc/authorize/resume?request=`             | Продолжение после входа                                                           |
| `POST /oidc/token`                                | `authorization_code`, `refresh_token` (ротация), `client_credentials`             |
| `GET/POST /oidc/userinfo`                         | Claims по scope: `profile`, `email`, `roles`, `biometrics`                        |
| `POST /oidc/introspect`, `POST /oidc/revoke`      | RFC 7662 и RFC 7009 (только конфиденциальные клиенты для интроспекции)            |
| `GET /oidc/logout`                                | Выход: с `id_token_hint` — сразу, иначе — подтверждение `/oauth/logout`           |
| `GET/POST /api/v1/oauth/requests/{id}[/decision]` | Данные для экранов входа и согласия; решение пользователя                         |
| `GET/POST /api/v1/oauth/logout`                   | Название приложения и подтверждённый выход                                        |

Пример подключения сервиса (код авторизации + PKCE):

```text
GET  /oidc/authorize?response_type=code&client_id=crm&redirect_uri=https://crm.example/cb
     &scope=openid%20profile%20offline_access&state=…&nonce=…&code_challenge=…&code_challenge_method=S256
POST /oidc/token  grant_type=authorization_code&code=…&redirect_uri=…&code_verifier=…  (Basic client_id:secret)
```

## 4.8. API v3.3: второй фактор и ритм набора

Все операции требуют входа. Ответы об ошибке — RFC 7807; неверный код — `401` с заголовком «Код не подошёл», блокировка — `429`.

| Метод и путь                    | Назначение                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `GET /mfa`                      | Состояние: включён ли TOTP, сколько кодов восстановления осталось                                                  |
| `POST /mfa/totp/setup`          | Новый секрет (base32) и `otpauth://`-ссылка для QR; `409`, если TOTP уже включён                                   |
| `POST /mfa/totp/confirm`        | `{code}` — подтверждение первым кодом; выдаёт 10 кодов восстановления (один раз); сотрудник получает полный доступ |
| `POST /mfa/totp/verify`         | `{code}` — второй фактор входа сотрудника; шаг времени принимается один раз                                        |
| `DELETE /mfa/totp`              | `{code}` — отключить; нужен завершённый вход (`@RequireMfa`); коды восстановления удаляются                        |
| `POST /mfa/recovery/verify`     | `{code}` — вход по коду восстановления; код гасится, в ответе — сколько кодов осталось                             |
| `POST /mfa/recovery/regenerate` | `{code}` — новый набор кодов (нужен код из приложения); прежние аннулируются                                       |
| `GET /keystroke`                | Зарегистрирован ли ритм, число повторов, фраза, сколько повторов нужно                                             |
| `POST /keystroke/enroll`        | `{samples: [{events: [{code, down, up}]}]}` — не менее 5 повторов; нужно согласие (`403 consent-required`)         |
| `POST /keystroke/verify`        | Один ввод фразы → `{accepted, distance, threshold, score}`; 5 отказов подряд — `429` на 5 минут                    |
| `DELETE /keystroke`             | Удалить ритм набора (отзыв согласия удаляет его тоже)                                                              |

Ритм: `code` — `KeyboardEvent.code` (физическая клавиша, не зависит от раскладки), `down`/`up` — миллисекунды от начала
ввода. Ошибки `422`: `KEYSTROKE_LENGTH`, `KEYSTROKE_CODES` (другая фраза, исправления), `KEYSTROKE_TIMING`, `KEYSTROKE_ROBOTIC`
(слишком ровные паузы). Подробности и обоснование — [ADR-0020](adr/0020-totp-recovery-keystroke.md).
