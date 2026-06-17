# Agent Workstation — Project Rules

## Methodology: SDD (Spec-Driven Development)

This project uses strict SDD. Every feature touching >1 file MUST have a spec before implementation.

### Pipeline
```
plan → test → sprint → review → done
```

### SDD Lifecycle
```
Idea → Spec (draft) → Grill → Spec (approved) → Plan → Implement (TDD) → Verify → Ship
```

### Rules
1. Specs use EARS notation for ALL acceptance criteria
2. Tests are executable assertions of spec sections
3. Coders NEVER see the spec — tests ARE the spec (information barrier)
4. Plans define HOW + ORDER. Specs define WHAT + WHY.
5. Bug fixes use issues only — no spec needed
6. Every PR must pass: typecheck + test + lint

## Tech Stack

- TypeScript (Node 22, ESM) — packages/cli, core, plugins, adapters
- Python 3.10+ — packages/daemon only
- Monorepo: turborepo
- DB: drizzle-orm + better-sqlite3
- CLI: citty
- Test: vitest (TS), pytest (Python)
- Lint: eslint

## Build Commands

```bash
turbo build          # build all packages
turbo test           # test all packages
turbo typecheck      # type-check all packages
npm run build        # same as turbo build
```

## Package Structure

- `packages/core` — types, state, orchestration. Other packages depend on this.
- `packages/cli` — aw binary. Depends on core.
- `packages/daemon` — Python aiohttp server. Independent.
- `packages/plugins` — issues, knowledge, devops, browser. Depends on core.
- `packages/adapters` — kiro, aider, claude-code, generic. Depends on core.

## Conventions

- File names: kebab-case (`daemon-client.ts`, `plan-parser.ts`)
- Exports: named exports, no default exports
- Error handling: typed errors with `code` field, never throw strings
- DB: drizzle-orm, migrations in `packages/core/src/db/migrations/`
- Tests: colocated `*.test.ts` files OR `__tests__/` directory

## Do NOT

- Import from `packages/daemon` in TypeScript code (it's Python, communicate via HTTP)
- Use `pool: 'forks'` in vitest (causes OOM — use threads only)
- Run raw `tsc --noEmit` (use `turbo typecheck` which has memory limits)
- Modify methodology/ docs during implementation (that's a separate concern)
- Add features not in the spec (solve what was asked)
