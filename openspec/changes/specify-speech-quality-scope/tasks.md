# Tasks

## 1. Apply the decision

- [ ] 1.1 Option A: amend requirement "Microphone audio quality" of `meeting-media` (on `origin/main` only, #145) to say recordings and broadcasts carry the same speech-quality audio, with a scenario for a recording. Option B: no spec edit now; open a new change for the opt-out once its form (room config, embedded attribute) is chosen.

## 2. Release surfaces

- [ ] 2.1 Option A: amend the `CHANGELOG.md` line under `## 3.10.0 (unreleased)` > `### Improved` > `#### UI` ("The microphone is sent at speech quality, 24 kbps instead of 48 kbps") to name recordings and broadcasts. Option B: leave it.
- [ ] 2.2 openvidu.io (option A): say on the meeting media and recordings pages of `docs/meet/` on `next` that the microphone, in the meeting and in recordings and broadcasts, is sent at speech quality.
