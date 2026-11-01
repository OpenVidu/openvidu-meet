# Tasks

## 1. Stamp raises with the shared clock

- [ ] 1.1 Add to `RedisService` (`meet-ce/backend/src/services/redis.service.ts`) a method returning the Redis server's time in milliseconds from `TIME`, and inject `RedisService` into `MeetingService` (`meet-ce/backend/src/services/meeting.service.ts`); verify with `pnpm run test:types` and `pnpm run lint` in `meet-ce/backend`.
- [ ] 1.2 In `writeHand`, pass that time to `raisedHandAttributes` instead of `Date.now()` for a raise; lowers do not read it. Verify in `meet-ce/backend/tests/integration/api/meetings/hand.test.ts`, in "should raise and lower the own hand, reporting each change to the webhooks", with the Redis time method spied to return a fixed moment far from `Date.now()`: `participantGet` and the spied `participantHandChanged` webhook report exactly that moment as `handRaiseDate`, which is how a skewed replica clock is ruled out without two replicas (backend integration suite, needs the OpenVidu local deployment; report as not run when unavailable). Run `./meet.sh test-unit-backend` and `./meet.sh lint-backend`.

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: none. Raise hand is new in 3.10.0 and its entry does not describe the queue clock.
- [ ] 2.2 openvidu.io: none. `docs/meet/features/meetings/raise-hand.md` says the queue follows the moment each hand went up, which stays true.
