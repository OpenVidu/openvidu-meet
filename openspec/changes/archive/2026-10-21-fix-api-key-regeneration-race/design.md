# Design

## Context

The API key collection has a unique index on the key value only, so nothing in the database prevents two documents. `createApiKey` runs `deleteAll` then `create`; `initializeApiKey` runs `findAll` then `create` at startup, inside the storage initialization lock, which is a different lock from anything a request takes. Webhook registration solves the same count-then-create shape with `MutexService.withRetryLock` and a `409` when the lock stays taken (`webhook-registry.service.ts`).

## Goals / Non-Goals

**Goals:**
- At most one API key after any interleaving of regenerations and startup seeding, on any number of replicas.

**Non-Goals:**
- Changing `deleteApiKeys`: deleting while a regeneration runs leaves either the new key or none, both valid outcomes of some order.
- Changing how a key is validated.

## Decisions

- **One Redis lock for every API key writer that creates.** Add `RedisLockName.API_KEY` and `MeetLock.getApiKeyLock()`; `createApiKey` and `initializeApiKey` run their read/delete/create inside `withRetryLock` on that key with a short TTL and a retry budget in `INTERNAL_CONFIG` (for example `API_KEY_LOCK_TTL` `5s`, a few attempts). Every replica shares Redis, so the lock serializes writers cluster-wide; inside it the single-replica sequence is correct. `createApiKey` keeps its read, delete and insert sequence, now inside the lock.
  - Alternative: a singleton document (fixed `_id` with an atomic upsert-replace). Rejected: it changes the persisted shape, so it needs a migration and a schema version bump for a collection of one document, and an upsert race on an empty collection still needs the unique `_id` to resolve.
  - Alternative: a MongoDB transaction. Rejected: it requires a replica-set MongoDB, which Meet does not assume.
- **Lock exhaustion answers `409`** with a dedicated error ("another API key change is in progress, please retry"), mirroring `errorWebhookCreationInProgress`. Startup seeding that cannot get the lock fails like the rest of storage initialization does today.

## Risks / Trade-offs

- [A replica dies holding the lock] -> the TTL releases it within seconds; waiting regenerations retry within the budget.
- [Seeding nested inside the storage initialization lock] -> the API key lock is a different key and its critical section is two queries, so a boot waits at most one regeneration.
