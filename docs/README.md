# docs

| File | What it is |
|---|---|
| [01-assignment-en.md](01-assignment-en.md) | The assignment, in English |
| [03-db-security-design.md](03-db-security-design.md) | Database and security design: schema, RLS, status RPC, triggers, grants, edge cases |
| [04-security-audit-checklist.md](04-security-audit-checklist.md) | Threat model and the attack cases behind `npm run attack` |
| [06-decisions-and-assumptions.md](06-decisions-and-assumptions.md) | Decisions where the spec is ambiguous, and what is not done |
| [EXPLANATION.md](EXPLANATION.md) | How the system works and is protected, for a non-technical reader (RU + EN) |

## Source of truth
03 describes the database exactly as migrated (`supabase/migrations/0001…0006`). If any doc disagrees with the SQL, the SQL wins.
