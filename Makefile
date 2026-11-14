# BioAuth Optimizer — команды разработки, проверки и запуска.
# `make` или `make help` показывает список целей. Совместим с GNU Make 3.81 (macOS) и новее.
#
# Переменные можно переопределить: make test TEST_DATABASE_URL=... | make logs SERVICE=api

SHELL := /bin/bash
.DEFAULT_GOAL := help

PNPM    ?= pnpm
PYTHON  ?= python3
BIO_DIR := services/bio-engine
COMPOSE ?= docker compose
SERVICE ?=

# База из docker-compose.yml опубликована на 127.0.0.1:55432 (редкий порт, чтобы не мешать локальному PostgreSQL).
DB_PORT           ?= 55432
DATABASE_URL      ?= postgresql://bioauth:bioauth@localhost:$(DB_PORT)/bioauth
# Администратор, от имени которого make calibrate предлагает и утверждает политику.
CALIBRATE_AS      ?= admin
TEST_DATABASE_URL ?= postgresql://bioauth:bioauth@localhost:$(DB_PORT)/bioauth_test

WEB_URL     ?= http://localhost:3000
API_URL     ?= http://localhost:4000
VERSION     := $(shell node -p "require('./package.json').version" 2>/dev/null || echo 0.0.0)
GIT_SHA     := $(shell git rev-parse --short HEAD 2>/dev/null || echo nogit)
RELEASE_ZIP ?= bioauth-optimizer-$(VERSION)-$(GIT_SHA).zip

BOLD  := \033[1m
DIM   := \033[2m
GREEN := \033[32m
CYAN  := \033[36m
RESET := \033[0m

define log
	@printf "$(GREEN)▶$(RESET) $(BOLD)%s$(RESET)\n" $(1)
endef

# ─────────────────────────────────────────────────────────────────────────────
##@ Справка

.PHONY: help
help: ## Показать эту справку
	@printf "\n$(BOLD)BioAuth Optimizer$(RESET) $(DIM)v$(VERSION) ($(GIT_SHA))$(RESET)\n"
	@awk 'BEGIN {FS = ":.*##"} \
		/^##@/ { printf "\n$(BOLD)%s$(RESET)\n", substr($$0, 5); next } \
		/^[a-zA-Z0-9_.-]+:.*##/ { printf "  $(CYAN)%-18s$(RESET) %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
	@printf "\n$(DIM)Переменные: DATABASE_URL, TEST_DATABASE_URL, SERVICE, COMPOSE, PNPM$(RESET)\n\n"

# ─────────────────────────────────────────────────────────────────────────────
##@ Установка

.PHONY: doctor
doctor: ## Проверить окружение: Node 22+, pnpm, Docker
	@node -e "const [M]=process.versions.node.split('.');if(+M<22){console.error('Нужен Node.js 22+, сейчас '+process.version);process.exit(1)}console.log('node   ',process.version)"
	@command -v $(PNPM) >/dev/null || { echo "pnpm не найден: corepack enable && corepack prepare pnpm@10.28.0 --activate"; exit 1; }
	@printf "pnpm    %s\n" "$$($(PNPM) --version)"
	@command -v docker >/dev/null && printf "docker  %s\n" "$$(docker --version | cut -d' ' -f3 | tr -d ,)" || echo "docker  не найден (нужен только для make up)"

.PHONY: install
install: ## Установить зависимости по lockfile (и git-хуки husky)
	$(call log,"Установка зависимостей")
	@$(PNPM) install --frozen-lockfile

# После git pull lockfile мог измениться: цели сборки и проверки сначала доустанавливают зависимости, иначе ESLint и tsc
# видят старые пакеты (например, fast-check 3 вместо 4) и падают с непонятными ошибками типов.
node_modules/.pnpm/lock.yaml: pnpm-lock.yaml
	$(call log,"pnpm-lock.yaml изменился — обновляю зависимости")
	@$(PNPM) install --frozen-lockfile
	@touch $@

.PHONY: deps
deps: node_modules/.pnpm/lock.yaml ## Доустановить зависимости, если lockfile новее node_modules

.PHONY: setup
setup: doctor install build ## Первая настройка: окружение, зависимости, сборка пакетов
	@printf "$(GREEN)Готово.$(RESET) Дальше: make db && make migrate && make dev\n"

# ─────────────────────────────────────────────────────────────────────────────
##@ Разработка

.PHONY: dev
dev: deps ## Запустить api (:4000) и web (:3000) в режиме разработки
	@DATABASE_URL="$(DATABASE_URL)" $(PNPM) dev

.PHONY: db
db: ## Поднять только PostgreSQL в Docker (для локальной разработки)
	$(call log,"PostgreSQL на 127.0.0.1:$(DB_PORT)")
	@$(COMPOSE) up -d --wait db
	@$(COMPOSE) exec -T db psql -U bioauth -d bioauth -tc "SELECT 1 FROM pg_database WHERE datname='bioauth_test'" | grep -q 1 \
		|| $(COMPOSE) exec -T db psql -U bioauth -d bioauth -c "CREATE DATABASE bioauth_test" >/dev/null
	@printf "  DATABASE_URL=%s\n  TEST_DATABASE_URL=%s\n" "$(DATABASE_URL)" "$(TEST_DATABASE_URL)"

.PHONY: migrate
migrate: ## Применить SQL-миграции и seed каталога СРО1 к DATABASE_URL
	@$(PNPM) --filter @bioauth/api build >/dev/null
	@DATABASE_URL="$(DATABASE_URL)" $(PNPM) --filter @bioauth/api migrate

.PHONY: build
build: deps ## Собрать все пакеты (turbo, с кэшем)
	@$(PNPM) build

# ─────────────────────────────────────────────────────────────────────────────
##@ Качество кода

.PHONY: format
format: deps ## Отформатировать весь репозиторий (Prettier)
	@$(PNPM) format

.PHONY: format-check
format-check: deps ## Проверить форматирование без изменений
	@$(PNPM) format:check

.PHONY: lint
lint: deps ## ESLint (strict + проверка типов) и steiger (FSD)
	@$(PNPM) lint

.PHONY: lint-fix
lint-fix: deps ## ESLint с автоисправлением
	@$(PNPM) lint:fix

.PHONY: typecheck
typecheck: deps ## Проверка типов TypeScript во всех пакетах
	@$(PNPM) typecheck

.PHONY: fix
fix: format lint-fix ## Исправить всё, что исправляется автоматически

.PHONY: commitlint
commitlint: ## Проверить сообщения коммитов относительно origin/main
	@$(PNPM) commitlint

# ─────────────────────────────────────────────────────────────────────────────
##@ Тесты

.PHONY: test
test: deps ## Все тесты; e2e API — на TEST_DATABASE_URL (make db)
	@TEST_DATABASE_URL="$(TEST_DATABASE_URL)" $(PNPM) test

.PHONY: test-core
test-core: deps ## Тесты вычислительного ядра (золотые и property)
	@$(PNPM) --filter @bioauth/optimization-core test

.PHONY: test-api
test-api: deps ## Тесты API (unit + e2e на PostgreSQL)
	@$(PNPM) --filter @bioauth/optimization-core --filter @bioauth/contracts build >/dev/null
	@TEST_DATABASE_URL="$(TEST_DATABASE_URL)" $(PNPM) --filter @bioauth/api test

.PHONY: test-web
test-web: deps ## Unit-тесты фронтенда
	@$(PNPM) --filter @bioauth/web test

.PHONY: test-e2e
test-e2e: ## E2E в браузере (Playwright) против запущенной системы WEB_URL
	@E2E_BASE_URL="$(WEB_URL)" $(PNPM) --filter @bioauth/web test:e2e

.PHONY: bio-setup
bio-setup: ## bio-engine: зависимости Python и модели ONNX (проверка SHA-256)
	@cd $(BIO_DIR) && $(PYTHON) -m pip install -r requirements-dev.txt && $(PYTHON) scripts/fetch_models.py

.PHONY: test-bio
test-bio: ## bio-engine: ruff, mypy --strict, pytest (нужен make bio-setup)
	@cd $(BIO_DIR) && ruff check . && ruff format --check . && $(PYTHON) -m mypy && $(PYTHON) -m pytest -q

.PHONY: check
check: format-check lint typecheck test ## Всё, что проверяет CI: формат, линтер, типы, тесты (bio-engine — make test-bio)

# ─────────────────────────────────────────────────────────────────────────────
##@ Docker

.PHONY: up
up: ## Собрать и запустить всё: db, bio-engine, api, web (ждёт готовности)
	$(call log,"docker compose up")
	@$(COMPOSE) up -d --build --wait
	@$(MAKE) --no-print-directory urls

.PHONY: images-save
images-save: ## Собрать образы и сохранить в bioauth-images.tar — для запуска без интернета (защита)
	$(call log,"docker compose build + docker save")
	@$(COMPOSE) build
	@docker save -o bioauth-images.tar $$($(COMPOSE) config --images)
	@printf "Сохранено $(CYAN)bioauth-images.tar$(RESET) (%s)\n" "$$(du -h bioauth-images.tar | cut -f1)"

.PHONY: images-load
images-load: ## Загрузить образы из bioauth-images.tar (затем make up-offline)
	@docker load -i bioauth-images.tar

.PHONY: up-offline
up-offline: ## Запустить из уже собранных образов, без сборки и без сети
	@$(COMPOSE) up -d --no-build --wait
	@$(MAKE) --no-print-directory urls

.PHONY: down
down: ## Остановить контейнеры (данные сохраняются)
	@$(COMPOSE) down

.PHONY: restart
restart: ## Перезапустить сервис: make restart SERVICE=api
	@$(COMPOSE) restart $(SERVICE)

.PHONY: logs
logs: ## Логи (все или SERVICE=api|web|db), с отслеживанием
	@$(COMPOSE) logs -f --tail=200 $(SERVICE)

.PHONY: ps
ps: ## Состояние контейнеров
	@$(COMPOSE) ps

.PHONY: config
config: ## Проверить docker-compose.yml
	@$(COMPOSE) config -q && echo "docker-compose.yml корректен"

.PHONY: psql
psql: ## Консоль PostgreSQL в контейнере db
	@$(COMPOSE) exec db psql -U bioauth -d bioauth

.PHONY: reset-db
reset-db: ## Удалить контейнеры и том с данными (необратимо)
	@read -r -p "Удалить все данные PostgreSQL? [y/N] " ans; [ "$$ans" = "y" ] || { echo "Отменено"; exit 1; }
	@$(COMPOSE) down -v

.PHONY: health
health: ## Проверить здоровье запущенной системы
	@curl -fsS $(API_URL)/health/live >/dev/null && echo "api   live   ok" || { echo "api не отвечает"; exit 1; }
	@curl -fsS $(API_URL)/health/ready >/dev/null && echo "api   ready  ok (БД доступна)" || { echo "api не готов"; exit 1; }
	@curl -fsS $(WEB_URL)/ >/dev/null && echo "web          ok" || { echo "web не отвечает"; exit 1; }
	@curl -fsS $(WEB_URL)/api/v1/examples/sro1 >/dev/null && echo "web → api    ok (прокси)" || { echo "прокси web → api не работает"; exit 1; }

.PHONY: smoke
smoke: up health test-e2e ## Поднять систему, проверить здоровье и прогнать e2e

.PHONY: urls
urls: ## Адреса интерфейса и API
	@printf "  Интерфейс  $(CYAN)%s$(RESET)\n  API (Scalar) $(CYAN)%s/api/docs$(RESET)\n" "$(WEB_URL)" "$(API_URL)"

.PHONY: secrets
secrets: ## Заменить демонстрационные секреты настоящими (.env) и применить их к системе: пароли, ключи, токены
	@node scripts/secrets.mjs
	@if grep -qx POSTGRES_PASSWORD .env.rotated; then \
		$(COMPOSE) up -d --wait db >/dev/null && \
		grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2- | \
			sed "s/.*/ALTER USER bioauth PASSWORD '&';/" | $(COMPOSE) exec -T db psql -q -U bioauth -d bioauth && \
		echo "  пароль базы данных изменён"; fi
	@if [ -s .env.rotated ]; then $(COMPOSE) up -d --build --wait >/dev/null && echo "  контейнеры пересобраны и перезапущены с новыми секретами"; fi
	@if grep -qx ADMIN_PASSWORD .env.rotated; then \
		$(COMPOSE) exec -T api sh -c 'node dist/modules/identity/staff.cli.js --login "$$ADMIN_LOGIN" --reset-password' >/dev/null && \
		echo "  пароль администратора: $$(grep '^ADMIN_PASSWORD=' .env | cut -d= -f2-)  (сохранён в .env; сеансы завершены)"; fi
	@if grep -qx TEMPLATE_KEYS .env.rotated; then \
		$(COMPOSE) exec -T api node dist/modules/biometrics/rekey.cli.js >/dev/null && \
		echo "  шаблоны лица, ритма и секреты TOTP перешифрованы новым ключом" && \
		node scripts/secrets.mjs --drop-dev >/dev/null && $(COMPOSE) up -d --wait >/dev/null && \
		echo "  ключ разработки dev удалён из TEMPLATE_KEYS"; fi
	@rm -f .env.rotated

.PHONY: calibrate
calibrate: ## Полная калибровка в запущенной системе (make up): лицо — ORL, ритм — CMU, PAD — по испытаниям
	$(call log,"калибровка: лицо (AT&T ORL) · ритм набора (CMU) · PAD по испытаниям UC-8")
	@$(COMPOSE) exec -T -e CALIBRATION_CACHE=/tmp/bioauth-calibration api \
		node dist/modules/calibration/calibrate.cli.js --as $(CALIBRATE_AS) --approve
	@mkdir -p calibration-report
	@$(COMPOSE) cp api:/tmp/bioauth-calibration/report/. calibration-report/ >/dev/null && \
		echo "  протокол «до/после»: calibration-report/protocol.md, .csv, .json"

.PHONY: login-report
login-report: ## Почему не пускает: последние попытки по лицу — сходство, порог, «живость», причина отказа
	@$(COMPOSE) exec -T db psql -U bioauth -d bioauth -P pager=off -f - < scripts/login-report.sql

.PHONY: calibrate-local
calibrate-local: deps ## То же для make dev: API из исходников, БД — DATABASE_URL, bio-engine — apps/api/.env
	@$(PNPM) --filter @bioauth/api build >/dev/null
	@DATABASE_URL="$(DATABASE_URL)" $(PNPM) --filter @bioauth/api calibrate --as $(CALIBRATE_AS) --approve \
		--report "$(CURDIR)/calibration-report"

.PHONY: protocol-cleanup
protocol-cleanup: ## Конец испытания: отозвать согласия участников PREFIX=… (без YES=1 — только список)
	@test -n "$(PREFIX)" || { echo "укажите PREFIX=<префикс логинов участников>, например PREFIX=p26-"; exit 1; }
	@$(COMPOSE) exec -T api node dist/modules/consent/protocol-cleanup.cli.js \
		--prefix "$(PREFIX)" --as $(CALIBRATE_AS) $(if $(YES),--yes,)

.PHONY: demo
demo: ## Загрузить демонстрационный каталог из 10 факторов в запущенный API
	@curl -fsS -X POST $(API_URL)/api/v1/factor-catalogs -H 'content-type: application/json' \
		--data @examples/catalog-10-factors.json >/dev/null && echo "Каталог «Расширенный каталог: 10 факторов» загружен" \
		|| echo "Не удалось: каталог уже загружен или API не запущен (make up)"

# ─────────────────────────────────────────────────────────────────────────────
##@ Выпуск и очистка

.PHONY: release-zip
release-zip: ## Архив исходников для сдачи (git archive HEAD, без node_modules)
	@git diff --quiet || printf "$(BOLD)Внимание:$(RESET) есть незакоммиченные изменения — в архив попадёт только HEAD\n"
	@git archive --format=zip --prefix=bioauth-optimizer/ -o $(RELEASE_ZIP) HEAD
	@printf "Создан $(CYAN)%s$(RESET) (%s)\n" "$(RELEASE_ZIP)" "$$(du -h $(RELEASE_ZIP) | cut -f1)"

.PHONY: kazpatent-listing
kazpatent-listing: ## Листинг исходного текста ядра для депонирования (docs/deliverables/kazpatent/)
	@node scripts/kazpatent-listing.mjs

.PHONY: clean
clean: ## Удалить артефакты сборки (dist, .next, .turbo, coverage)
	@find . -path ./node_modules -prune -o \( -name dist -o -name .next -o -name .turbo -o -name coverage \) -type d -prune -print \
		| grep -v node_modules | xargs rm -rf
	@echo "Артефакты сборки удалены"

.PHONY: distclean
distclean: clean ## clean + удалить все node_modules
	@find . -name node_modules -type d -prune -exec rm -rf {} +
	@echo "node_modules удалены; заново: make install"
