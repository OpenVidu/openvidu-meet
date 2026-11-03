# Tasks

## 1. Deliver to the current meeting

- [ ] 1.1 In `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/services/meeting-reactions.service.ts`, drop the `roomId` and `identity` parameters of the delivery loop (`sendPending`) and read both from the services at each delivery; keep `clear()` emptying `pending` so the old loop ends. Verified in `meeting-reactions.service.spec.ts` with the clock collaborator mocked (no scaled sleeps): a pick made in room B during room A's cooldown is posted to room B with B's identity.

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: no new line. Reactions are new in 3.10.0 (#117).
- [ ] 2.2 openvidu.io: none.
