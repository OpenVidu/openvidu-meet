# OpenAPI specification

The REST API is described with OpenAPI 3.1, split across many small YAML files
linked by relative `$ref`. There are two entry specs:

| Entry file                        | API          | Server            |
| --------------------------------- | ------------ | ----------------- |
| `openvidu-meet-api.yaml`          | Public API   | `meet/api/v1`     |
| `openvidu-meet-internal-api.yaml` | Internal API | `/internal-api/v1`|

> ⚠️ Keep these two entry filenames and the `openapi/` folder name unchanged —
> they are referenced by `package.json` (`doc:api`/`doc:internal-api`),
> `nodemon.docs.json`, `meet.sh`, and the Dockerfile.

## Layout — organized by domain

Each domain has its own folder; within it, files are grouped by type:

```
<domain>/
  <domain>.yaml          # paths (operations) for this domain
  requests/              # request bodies
  responses/
    success/             # 2xx responses
    errors/              # 4xx/5xx responses
  schemas/               # data models
  parameters/            # query / path / header parameters
  headers/               # response headers (recordings only)
```

`shared/` holds everything that is **not** specific to one domain: the generic
error responses (`unauthorized`, `validation`, `forbidden`, `internal-server`,
…), pagination/sort parameters, common schemas (`error`, `meet-pagination`,
`meet-extra-field-metadata`), plus `info.yaml`, `tags.yaml` and `security.yaml`.

### Public vs internal

A domain is **public-only** (`rooms`, `recordings`, `webhooks`), **internal-only** (`auth`,
`meetings`, `config`, `ai-assistants`, `analytics`, `api-keys`), or **mixed**
(`users`, `room-members`). A mixed domain keeps its internal-only members under
an `internal/` subfolder (e.g. `users/internal/`). Internal-only domains are
ordinary top-level folders — which spec they belong to is defined by which
entry file references them.

The `webhooks/` folder serves double duty: the outgoing webhook **events**
(the OpenAPI 3.1 `webhooks:` section) live in `webhooks.yaml`, and the public
`/webhooks` **resource** (registering the endpoints those events are delivered
to) lives in `webhooks-api.yaml`. The legacy single-URL webhook
**configuration** (the `/config/webhooks` endpoints) still lives in `config/`
until the console switches to the resource.

### File naming

Filenames keep the domain word and drop only what the folder already conveys:
the `success-`/`error-` response prefix and the `-request` suffix. For example
`success-create-room.yaml` → `rooms/responses/success/create-room.yaml`.

### Naming new operations and paths

New identifiers follow the API naming charter (full text: `meet-ce/typings/CLAUDE.md`, "API naming
charter"; registry: `meet-ce/typings/src/api-registry.ts`), enforced by
`scripts/lint-api-naming.mjs` at the repo root — `./meet.sh lint-backend` runs it, so CI fails on a
violation:

- Every new `operationId` is `moduleAction` camelCase (`meetingEnd`, `participantKick`), starting
  with a registered module token. The pre-charter operations (`createRoom`, `startRecording`, …)
  are frozen in an allowlist inside the lint script — do not add to it; public `operationId`s
  generate SDK method names and get renamed in the next major.
- A new **top-level path segment** must be registered in `MEET_API_REST_GROUPS` first, and that is
  an API-design decision: live meeting features go under `/meetings/{roomId}`, only durable
  artifacts (`/rooms`, `/recordings`) and platform groups get a top level. Collections are plural,
  singletons singular.

## Commands (run from `meet-ce/backend`)

```bash
pnpm run lint:api          # validate every $ref resolves (Redocly)
pnpm run doc:api           # generate public.html
pnpm run doc:internal-api  # generate internal.html
pnpm run dev:rest-api-docs # (workspace root) watch + regenerate on change
```

Adding or moving a file means updating the relative `$ref`s that point to it;
`pnpm run lint:api` reports any that no longer resolve, with file and line.

`.redocly.lint-ignore.yaml` records a set of **pre-existing** lint findings
(multi-schema-per-file definitions, operations without per-op `security`, a
couple of example/component warnings) so that `lint:api` passes today while
still failing on any *new* problem — most importantly a broken `$ref`. Delete
the relevant entries (or regenerate with `redocly lint --generate-ignore-file`)
if you fix the underlying issues.
