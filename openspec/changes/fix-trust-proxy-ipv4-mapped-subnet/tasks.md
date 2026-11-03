# Tasks

## 1. Warn about the subnet

- [ ] 1.1 In `meet-ce/backend/src/server.ts` (trust proxy parsing, lines about 59-70) detect an IPv4-mapped subnet with a prefix below 96 and log the warning; extract the parsing into a small function so it can be tested. Verify with a unit test under `meet-ce/backend/tests/unit/` for that function (`::ffff:10.0.0.0/8` warns; `::ffff:10.0.0.0/104`, `10.0.0.0/8`, `true` and a hop count do not).

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: amend the `Fixed` > `Deployment` line on `SERVER_TRUST_PROXY` (3.10.0): replace "Such a subnet no longer matches every IPv4 address." by "Such a subnet now matches no IPv4 address, and Meet logs a warning at startup." (the second half only if the warning is kept).
- [ ] 2.2 openvidu.io: none.
