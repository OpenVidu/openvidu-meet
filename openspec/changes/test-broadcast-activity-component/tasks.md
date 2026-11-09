# Tasks

Paths are relative to `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/openvidu-components/`.

## 1. Spec for the activity

- [ ] 1.1 Create `components/panel/activities-panel/broadcast-activity/broadcast-activity.component.spec.ts` (the one component with no spec; this is the only new spec file) with a stub `BroadcastStateService` and the room destinations given as inputs. Cover: `phase()` of a row for each status; a refusal of a start while live, shown with the rows unchanged; a refusal of a destination added while live with another row `failed`, which keeps that row failed (fails today, see `fix-broadcast-destination-failures-kept`: add the case there if that change lands first and leave it out here); a meeting destination listed after the component is created anew (see `fix-broadcast-panel-keeps-choices`).
- [ ] 1.2 Run `./meet.sh test-unit-frontend` and `./meet.sh lint-frontend`. Do not use `it.failing` for a case that still fails: leave that case to the change that fixes it.

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: none, tests only.
- [ ] 2.2 openvidu.io: none.
