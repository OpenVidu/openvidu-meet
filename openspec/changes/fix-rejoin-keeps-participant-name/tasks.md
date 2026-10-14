# Tasks

## 1. Name reservations owned by an identity

- [ ] 1.1 Store the owner identity and reservation time in the name reservation and let the same identity reuse its own reservation; decide the participant identity before reserving in the join-token flow. Verify with cases in `meet-ce/backend/tests/integration/api/meetings/participant-name.service.test.ts`: same identity reserving "Ana" twice gets "Ana" both times, another identity gets "Ana_1".
- [ ] 1.2 Make the release an atomic compare-and-delete on identity and reservation time, passing the leaving session's identity and join time from the participant-left handling; verify in `participant-name.service.test.ts` that releasing with the earlier session's join time keeps a reservation retaken later, and that releasing the current session frees it and returns its suffix to the pool.
- [ ] 1.3 Verify that a value written in the old format (bare timestamp) is still released and never reused by identity, in `participant-name.service.test.ts`.
- [ ] 1.4 Add to `meet-ce/frontend/e2e/participants.test.ts` a test where an identified guest reloads the meeting page and keeps their name without a suffix; report it as not run if the local deployment is unavailable.

## 2. Release surfaces

- [ ] 2.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### UI` of `CHANGELOG.md`: "- A room member or user who joined a meeting again before their earlier session had left it, from a second tab, after reloading or by rejoining quickly, was renamed with a numeric suffix such as `Ana_1` everywhere the meeting shows or reports names. They now keep their name."
- [ ] 2.2 openvidu.io: none.
