# Proposal

## Why

With the updated proxy library, a `SERVER_TRUST_PROXY` subnet in IPv4-mapped IPv6 notation with a prefix below 96, such as `::ffff:10.0.0.0/8`, matches no IPv4 address. An operator who wrote it to trust their 10.x proxies now trusts none, so every client behind the proxy shares one rate-limit key: 5 failed logins from anyone block `loginUser` for everyone for 5 minutes. The 3.10.0 changelog line says such a subnet "no longer matches every IPv4 address", which hides that it now matches none.

## What Changes

- Meet logs a warning at startup when `SERVER_TRUST_PROXY` holds an IPv4-mapped subnet with a prefix below 96, naming the variable and the subnet.
- The changelog line states the fact: such a subnet now matches no IPv4 address.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `deployment`: an unusable proxy subnet is reported at startup.

## Impact

- Deployment configuration: a startup warning for one `SERVER_TRUST_PROXY` shape; the value is still passed to Express unchanged.
- REST API, webhooks, embedded API, meeting UI, console UI: not affected.
- Code: the trust proxy parsing in `meet-ce/backend/src/server.ts`.
- openvidu.io: none.

## Decisions to confirm

- How to treat the subnet. Proposed: warn at startup and reword the changelog line. Alternative: reword the changelog line only. Alternative: translate `::ffff:a.b.c.d/N` into the IPv4 subnet `a.b.c.d/(N-96)`, which guesses the operator's intent.

## Source

3.10.0 pre-release audit, finding AU-8 (low, verified-test), introduced by the proxy-addr 2.0.8 upgrade in #134.
