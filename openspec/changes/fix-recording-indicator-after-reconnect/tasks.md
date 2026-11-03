# Tasks

## 1. Report the end a reconnecting participant missed

- [ ] 1.1 In the participant-joined handler of `meet-ce/backend/src/services/livekit-webhook.service.ts` (lines 170-200), send the meeting's latest recording state to the joining participant even when the recording is final, not only when it is `active` or `starting`. Verify with new cases in `meet-ce/backend/tests/unit/services/livekit-webhook.service.test.ts`: a join after a `complete` recording sends the final state, a join with no recording sends nothing.
- [ ] 1.2 Check that the client already ignores a repeated final state (`meeting-events.service.ts` in `shared-meet-components`); add a unit case to its existing spec if not covered. The Playwright recordings suite (`meet-ce/frontend/e2e/recordings.test.ts`) needs the OpenVidu local deployment; report as not run when unavailable.

## 2. Release surfaces

- [ ] 2.1 Add under `## 3.10.0 (unreleased)` > `### Fixed` > `#### UI` of `CHANGELOG.md`: "The recording mark stayed on for a participant who reconnected after the recording had ended. It now follows the recording's end." Check with the maintainer that the mark predates 3.10 before adding it; if the mark is part of #101 alone, no line.
- [ ] 2.2 openvidu.io: none.
