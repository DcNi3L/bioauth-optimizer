# 04. REST API

Базовый путь — `/api/v1`, формат JSON. Swagger UI — `GET /api/docs`, спецификация генерируется из zod-схем `@bioauth/contracts`. Числа передаются как IEEE 754 double без округления; форматирует их только UI.

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
`Origin` (защита от CSRF). Полные схемы — в Swagger.

| Метод        | Путь                                        | Доступ                     | Назначение                                                         |
| ------------ | ------------------------------------------- | -------------------------- | ------------------------------------------------------------------ |
| POST         | `/identity/subjects`                        | открыт                     | Регистрация субъекта (логин, имя) — сразу открывает сессию         |
| POST         | `/identity/login`                           | открыт                     | Вход сотрудника по паролю (первый фактор)                          |
| POST         | `/identity/logout`                          | открыт                     | Выход                                                              |
| GET          | `/identity/me`                              | сессия                     | Текущий пользователь: роль, согласие, шаблон, passkey, MFA         |
| GET          | `/consent/text`                             | открыт                     | Текст согласия на обработку биометрии                              |
| POST, DELETE | `/consent`                                  | сессия                     | Дать согласие / отозвать (удаляет биометрию)                       |
| POST, DELETE | `/enrollment/face`                          | субъект, согласие          | Регистрация лица по 5 кадрам / удаление шаблона                    |
| POST         | `/webauthn/register/options`, `/verify`     | сессия                     | Регистрация passkey                                                |
| GET, DELETE  | `/webauthn/credentials[/:id]`               | сессия                     | Свои passkey                                                       |
| POST         | `/webauthn/staff/options`, `/verify`        | сотрудник                  | Второй фактор сотрудника                                           |
| POST         | `/auth/sessions`                            | открыт                     | Начать вход субъекта: шаги политики, nonce, случайные команды      |
| POST         | `/auth/sessions/:id/face`                   | открыт                     | Кадры лица: нейтральные + по шагам команд → решение                |
| POST         | `/auth/sessions/:id/passkey/*`              | открыт                     | Второй шаг: options / verify / cancel                              |
| GET          | `/policies[/:id]`                           | admin, researcher, auditor | Версии политики                                                    |
| POST         | `/policies`                                 | admin, researcher + MFA    | Предложить версию                                                  |
| POST         | `/policies/:id/approve` `reject` `rollback` | admin + MFA                | Решение (утверждает не автор предложения)                          |
| GET          | `/audit/events`, `/audit/verify`            | admin, auditor             | Журнал аудита; проверка цепочки хэшей                              |
| GET          | `/calibration/overview`                     | admin, researcher, auditor | Накопленные оценки по версиям моделей, действующая политика, дрейф |
| POST         | `/calibration/threshold`                    | admin, researcher          | Калибровка τ_face / τ_pad ядром v1 + проверка достаточности        |
| POST         | `/calibration/propose`                      | admin, researcher + MFA    | Политика из экспериментов калибровки                               |
| GET          | `/calibration/factors`                      | admin, researcher, auditor | Измеренные характеристики факторов                                 |
| POST         | `/calibration/factors/catalog`              | admin, researcher          | Каталог факторов из измерений для решателя v1                      |
| GET          | `/calibration/report`                       | admin, researcher, auditor | Протокол §10.11: «до/после калибровки» с интервалами               |
| POST         | `/calibration/drift/check`                  | admin, researcher          | Проверить дрейф FRR сейчас (обычно по расписанию)                  |
| POST         | `/calibration/drift/:id/acknowledge`        | admin                      | Принять уведомление о дрейфе                                       |
| POST, GET    | `/calibration/batch[/:id]`                  | admin, researcher          | Пакетный режим: zip → набор оценок (фоновая задача)                |
| GET, DELETE  | `/calibration/batch/:id/csv`, `/:id`        | admin, researcher          | CSV оценок / отмена задачи                                         |
| POST         | `/pad-test/samples`                         | admin, researcher          | Испытание PAD: подлинное предъявление или атака                    |
| GET          | `/pad-test/report?threshold=`               | admin, researcher, auditor | APCER по видам атак, BPCER                                         |
| GET          | `/attempts`                                 | admin, researcher, auditor | Журнал попыток (keyset-пагинация); аудитору оценки не показываются |

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
