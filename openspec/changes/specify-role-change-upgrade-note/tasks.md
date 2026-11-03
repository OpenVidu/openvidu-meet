# Tasks

## 1. Decide and apply

- [ ] 1.1 Record the decision of open product question 10.
- [ ] 1.2 Option B only: keep emitting the removed role-updated signal next to the current notice, marked deprecated in `meet-ce/typings/src/frontend-signal.ts` until 3.12.0, and write a delta for the requirement that owns it (remove `skip_specs`). Verify in `meet-ce/backend/tests/unit/services/frontend-event.service.test.ts`.

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: option A adds under `### Upgrade notes` of `## 3.10.0 (unreleased)`: "Participants who are in a meeting during the upgrade reload the page to see promotions and demotions." Option B: none.
- [ ] 2.2 openvidu.io: none.
