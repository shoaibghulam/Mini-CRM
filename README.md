# Мини-CRM «Объекты и задачи»

Тестовое задание 2B Studio: CRM для строительной компании. Постановщик ставит задачи по объектам (стройкам), исполнители берут их в работу и отправляют на проверку.

**Стек:** React 19 + TypeScript + Vite, Mantine, Supabase (Postgres, Auth, RLS).

**Главное:** все правила доступа и переходы статусов проверяет **база данных**. Интерфейс только прячет недоступные кнопки. Запрос в Supabase в обход интерфейса не позволит сделать ничего лишнего: это проверяют `npm run db:verify` (50 проверок) и `npm run attack` (167 атак через публичный API).

## Запуск

```bash
npm install
cp .env.example .env      # заполнить значения (см. ниже)
npm run dev               # http://localhost:5173
```

| Переменная | Где взять | Куда попадает |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API (publishable key) | Во фронтенд. Ключ публичный по замыслу Supabase, данные защищает RLS |
| `SUPABASE_DB_PASSWORD` | Supabase → Project Settings → Database | Только в Node-скрипты, **никогда** во фронтенд |
| `DEMO_MANAGER_PASSWORD`, `DEMO_ASSIGNEE_PASSWORD` | Придумать самому | Только в `db:seed` и `attack` |

`service_role` нигде не используется и не нужен.

## База данных (новый проект Supabase)

1. Authentication → Sign In / Providers: **выключить «Allow new users to sign up» и «Anonymous sign-ins».**
2. Применить миграции и заполнить демо-данными:
   ```bash
   npm run db:apply    # supabase/migrations/0001…0006 по порядку; повторный запуск безопасен
   npm run db:seed     # 1 постановщик, 2 исполнителя, 3 объекта, 7 задач во всех статусах
   npm run db:verify   # проверки RLS и переходов от лица каждого пользователя (в откатываемых транзакциях)
   npm run attack      # атаки через публичный REST API с publishable-ключом
   ```
   Если в сети нет IPv6, скрипты подключаются через session pooler Supabase. Хост и пользователя можно переопределить через `SUPABASE_DB_HOST` / `SUPABASE_DB_USER`.

## Проверки

```bash
npm run typecheck && npm test && npm run build

# E2E (Playwright, живая БД, нужен запущенный npm run dev): полный цикл задачи через UI
# от лица постановщика и двух исполнителей; за собой убирает (задача — мягко удаляется).
npx playwright install chromium   # один раз
npm run e2e
```

## Как устроено

| Слой | Где |
|---|---|
| Схема, enum статусов, таблица разрешённых переходов | `supabase/migrations/0001_schema.sql` |
| RLS-политики | `0003_rls.sql`, `0006_hardening.sql` |
| Смена статуса: единственный путь, RPC `change_task_status` (проверка перехода, роли, исполнителя и комментария, блокировка строки, запись истории в той же транзакции) | `0004_status_rpc_and_triggers.sql`, `0006_hardening.sql` |
| Права на уровне колонок: клиент не может записать `status`, `author_id`, `created_at`, историю | `0005_grants.sql` |
| Мягкое удаление задач: история никогда не удаляется | `0006_hardening.sql` |
| Кнопки действий в UI (подсказка, не защита) | `src/domain/availableActions.ts` |

Подробно: [docs/03-db-security-design.md](docs/03-db-security-design.md). Решения и допущения: [docs/06-decisions-and-assumptions.md](docs/06-decisions-and-assumptions.md). Объяснение для руководителя: [docs/EXPLANATION.md](docs/EXPLANATION.md).

## Демо-доступы

Передаются вместе со ссылкой на приложение: 1 постановщик (`manager@demo.test`) и 2 исполнителя (`alice@demo.test`, `bob@demo.test`).
