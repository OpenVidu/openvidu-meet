# Proposal

## Why

Two string checks in the code that builds Meet's public URLs break URLs a deployment can legitimately configure:

- `MEET_BASE_URL=http://example.com:8080` becomes `http://example.com80`: the default-port check removes the first
  `:80` (or `:443`) substring it finds, not a whole default port. Every `Location` header, access URL and recording
  URL Meet returns is wrong.
- With `MEET_BASE_PATH=/r`, the stored access URL `/room/<roomId>` is read back as `oom/<roomId>`: the base path is
  stripped whenever the path starts with its characters, not only when it is the first whole segment.

Found by the backend test audit; the new `tests/unit/utils/url.utils.test.ts` reproduces both.

## What Changes

- `getBaseUrl()` removes `:443` from an `https` URL and `:80` from an `http` URL only when that is the whole port.
- `stripBasePath()` removes the base path only when it is the whole path or followed by `/`.
- No spec change: "Public URLs from MEET_BASE_URL" in `deployment` already requires only the default port to go.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). The code is brought in line with `deployment` "Public URLs from MEET_BASE_URL".

## Impact

- Deployment: `MEET_BASE_URL` with a non-default port starting with `80`/`443`, and short `MEET_BASE_PATH` values,
  now produce correct URLs.
- Not affected: REST API contract, webhooks contract, embedded API, UI.
- Code: `meet-ce/backend/src/utils/url.utils.ts`.
- openvidu.io: none.
