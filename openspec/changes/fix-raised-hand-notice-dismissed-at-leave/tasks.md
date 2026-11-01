# Tasks

## 1. Dismiss the notice at leave

- [ ] 1.1 In `onParticipantLeft` of `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/services/meeting-event-handler.service.ts`, replace `this.handNotice = undefined` with `this.dismissHandNotice()`. Verify with a new case in the `participant left` block of `meeting-event-handler.service.spec.ts`: with a raised-hand notice shown, `onParticipantLeft` calls `NotificationService.dismissNotification` with that notice's id, and a hand raised in the next meeting starts a new notice. Run `./meet.sh test-unit-frontend` and `./meet.sh lint-frontend`.

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: no line. Raise hand is new in 3.10.0 (#109) and its `Added` entry does not describe the notice, so it stays as written.
- [ ] 2.2 openvidu.io: none (the raise hand page does not describe the notice's lifetime).
