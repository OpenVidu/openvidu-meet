# Project Guidelines

## Code Style
- TypeScript + ESM across backend packages (`"type": "module"`): keep explicit `.js` suffix for local imports in TS source (example: `meet-ce/backend/src/middlewares/auth.middleware.ts`).
- Respect strict TS settings and path aliases from package `tsconfig.json` (example: `meet-ce/frontend/tsconfig.json` with `@app/*`, `@environment/*`, and shared-components source mapping).
- In Angular packages, follow existing standalone/signal patterns already documented in `meet-ce/frontend/.github/copilot-instructions.md` for frontend-only edits.
- Keep changes small and package-scoped; avoid cross-package refactors unless required by the task.

## Architecture
- Monorepo is pnpm-workspace based (`pnpm-workspace.yaml`) with CE and PRO packages plus `testapp`.
- CE is the base product: `meet-ce/backend` (Express + Inversify), `meet-ce/frontend` (Angular), `meet-ce/typings` (shared contracts), `meet-ce/frontend/webcomponent`.
- PRO extends CE behavior, especially via route/provider customization (see `meet-ce/frontend/src/app/app.routes.ts` vs `meet-pro/frontend/src/app/app.routes.ts`).
- Shared Angular domain logic is in `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/*`.

## Build and Test
- Runtime baseline: Node.js >= 22 and pnpm workspace usage from repo root.
- Install all workspaces: `pnpm install`
- Preferred orchestrator: `./meet.sh dev`, `./meet.sh build`, `./meet.sh test-unit-backend`, `./meet.sh test-unit-webcomponent`, `./meet.sh test-e2e-webcomponent`
- Root filtered commands: `pnpm --filter @openvidu-meet/backend run start:dev|build|test:unit`
- Frontend CE: `pnpm --filter @openvidu-meet/frontend run dev|build|test:unit|lib:build`
- Typings: `pnpm --filter @openvidu-meet/typings run dev|build`
- Webcomponent: `pnpm --filter openvidu-meet-webcomponent run build|test:unit|test:e2e`
- Backend integration suites are exposed at root (`test:integration-backend-*`) and backend package (`test:integration-*`).

## Project Conventions
- Use `meet.sh` or `pnpm --filter` commands instead of ad-hoc `cd` workflows for routine tasks.
- Backend DI registration order is intentional; keep dependency bind order coherent when adding services (`meet-ce/backend/src/config/dependency-injector.config.ts`).
- Treat `meet-ce/typings` as the source of shared API/domain contracts; update typings first when frontend/backend payloads change.
- For CI/Docker dependency switching of `openvidu-components-angular`, use only:
	- `./meet.sh prepare-ci-build --components-angular-version <version>` or
	- `./meet.sh prepare-ci-build --components-angular-tarball <path>`
	- `./meet.sh restore-dev-config` after build/test.
- Do not manually rewrite workspace dependencies (`workspace:*`) or `pnpm-workspace.yaml`; use scripts above.

## Integration Points
- External sibling repo dependency is `../openvidu/openvidu-components-angular/projects/openvidu-components-angular` (declared in `pnpm-workspace.yaml`).
- Development workspace uses `pnpm-workspace.yaml`; CI/Docker mode is switched via `pnpm-workspace.docker.yaml` through `prepare-ci-build`.
- Frontend integration relies on `@openvidu-meet/shared-components` and `openvidu-components-angular` via workspace links.
- Backend integrations include LiveKit and optional blob providers (S3/ABS/GCS) configured through storage factory and environment (`meet-ce/backend/src/config/dependency-injector.config.ts`).
- Local backend development env is `meet-ce/backend/.env.development` (LiveKit URL/API key/secret expected).

## Security
- Auth is a validator chain with priority (`apiKey > roomMemberToken > accessToken > anonymous`) in `meet-ce/backend/src/middlewares/auth.middleware.ts`.
- Header contract is centralized in `meet-ce/backend/src/config/internal-config.ts` (`authorization`, `x-refresh-token`, `x-room-member-token`, `x-api-key`).
- Request context relies on request-scoped session service (AsyncLocalStorage-backed singleton); avoid bypassing it when adding auth-aware logic.
- Frontend token persistence currently uses localStorage (`meet-ce/frontend/projects/shared-meet-components/src/lib/shared/services/token-storage.service.ts`); preserve existing flows when modifying auth.