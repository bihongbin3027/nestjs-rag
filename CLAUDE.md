# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NestJS v11 application with one feature module (`UserModule`). Uses pnpm as package manager.

## Common Commands

| Task | Command |
|------|---------|
| Install deps | `pnpm install` |
| Dev server (watch) | `pnpm run start:dev` |
| Build | `pnpm run build` |
| Lint (with auto-fix) | `pnpm run lint` |
| Format | `pnpm run format` |
| Unit tests | `pnpm run test` |
| Unit tests (watch) | `pnpm run test:watch` |
| Single test file | `pnpm run test -- path/to/file.spec.ts` |
| E2E tests | `pnpm run test:e2e` |
| Test coverage | `pnpm run test:cov` |

## Architecture

- **Entry point**: `src/main.ts` — standard NestJS bootstrap, no global pipes/filters/interceptors wired yet.
- **Root module**: `src/app.module.ts` imports `UserModule`.
- **Feature modules** follow the pattern: `src/<module>/<module>.module.ts` with controller, service, dto/, entities/ subdirectories.
- **Shared infrastructure**: `src/common/libs/log4js/` contains exception filters, interceptor, middleware, and a custom `Logger` class (built on `log4js`). These are not yet wired into the app.
- **Config system**: `src/config/index.ts` loads YAML files (`dev.yml`, `test.yml`, `prod.yml`, `docker.yml`) based on `NODE_ENV`. **No YAML config files exist yet** — importing the Logger will fail at runtime without them.

## Testing Patterns

- **Unit tests**: `*.spec.ts` files colocated with source. Use `@nestjs/testing`'s `Test.createTestingModule()`.
- **E2E tests**: `*.e2e-spec.ts` in `test/` directory. Use `supertest` against a `createNestApplication()` instance.

## Code Style

- ESLint v9 flat config with `typescript-eslint` type-checked rules + Prettier integration.
- Prettier: single quotes, trailing commas.
- `@typescript-eslint/no-explicit-any` is OFF; `no-floating-promises` and `no-unsafe-argument` are WARN.
- TypeScript strict mode enabled (`strictNullChecks`, `noImplicitAny`, `strictBindCallApply`).
