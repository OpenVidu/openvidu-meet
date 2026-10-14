# Raise Hand Specification

## Purpose

Participants raise their hand to ask for a turn without interrupting; every participant sees the same queue of raised hands, and holders of `participantHandLower` lower other participants' hands. Meeting participants, host applications, REST clients and webhook receivers rely on it.

Surfaces: REST API (`participantHandUpdate`, `participantHandLowerAll`, and the hand state in `participantList` and `participantGet`; `meet-ce/backend/openapi/meetings/`), webhook `participantHandChanged` (`meet-ce/backend/openapi/webhooks/`), embedded commands `participantHandRaise`, `participantHandLower`, `participantHandLowerAll` and event `participantHandChanged` (`meet-ce/typings/src/embedded/`), room config `raiseHand.enabled`, permission `participantHandLower`, the meeting UI (toolbar, camera tiles, participants panel, status rail, notices). Documented in openvidu.io `docs/meet/features/meetings/raise-hand.md`.

## Requirements

### Requirement: Raise hand can be turned off per room
Raise hand SHALL be enabled in new rooms unless `raiseHand.enabled` is set to `false`. While it is `false`, the server SHALL reject every raise with 403 and the meeting SHALL NOT show the raise hand button; lowering a hand SHALL still be allowed.

#### Scenario: Raise rejected in a room with the feature off
- **GIVEN** a room with `raiseHand.enabled` false and a participant in its meeting
- **WHEN** the participant asks to raise their hand through the REST API
- **THEN** the request answers 403

#### Scenario: Button hidden
- **GIVEN** a room with `raiseHand.enabled` false
- **WHEN** a participant joins its meeting
- **THEN** the toolbar shows no raise hand button

### Requirement: Raise or lower the own hand
`PUT /api/v1/meetings/{roomId}/participants/{participantIdentity}/hand` (`participantHandUpdate`) with `raised: true` or `false` SHALL raise or lower that participant's hand. A room member token whose participant is the target SHALL need no permission. The moment a hand goes up SHALL be its `handRaiseDate`.

#### Scenario: Speaker raises and lowers their hand
- **GIVEN** a speaker without `participantHandLower` in a meeting
- **WHEN** they send `raised: true` for their own identity with their room member token, and later `raised: false`
- **THEN** both requests answer 200
- **AND** `participantGet` reports `handRaised` true with a `handRaiseDate` after the first and `handRaised` false after the second

### Requirement: Lowering another participant's hand
Lowering a hand that is not the caller's own SHALL require `participantHandLower` (403 without it) and SHALL be attributed to a moderator. An API key SHALL be able to lower any hand.

#### Scenario: Moderator lowers a speaker's hand
- **GIVEN** a speaker with a raised hand and a moderator holding `participantHandLower`
- **WHEN** the moderator sends `raised: false` for the speaker
- **THEN** the hand is lowered and the change is attributed to a moderator

#### Scenario: Speaker without the permission
- **GIVEN** two speakers without `participantHandLower`, one with a raised hand
- **WHEN** the other sends `raised: false` for that hand
- **THEN** the request answers 403 and the hand stays raised

### Requirement: Only its owner raises a hand
Raising a hand that is not the caller's own SHALL be rejected with 409, whatever the caller's permissions, an API key included.

#### Scenario: Moderator tries to raise a speaker's hand
- **GIVEN** a moderator holding `participantHandLower`
- **WHEN** they send `raised: true` for a speaker
- **THEN** the request answers 409

#### Scenario: API key tries to raise a hand
- **WHEN** a backend sends `raised: true` for a participant with the API key
- **THEN** the request answers 409

### Requirement: Hand request validation
`participantHandUpdate` SHALL answer 422 when `raised` is not a boolean, and 404 when the room has no meeting running or the participant is not in it.

#### Scenario: Missing boolean
- **WHEN** a client sends `{ "raised": "yes" }`
- **THEN** the request answers 422

#### Scenario: Participant not in the meeting
- **WHEN** a client lowers the hand of an identity that is not in the meeting
- **THEN** the request answers 404

### Requirement: A hand already in the requested state is left alone
A request for the state a hand already has SHALL succeed without changing anything and without a webhook or event. A repeated raise SHALL keep the original `handRaiseDate` and the hand's place in the queue.

#### Scenario: Raising twice
- **GIVEN** a participant whose hand went up at T
- **WHEN** they raise it again
- **THEN** the request answers 200 and `handRaiseDate` is still T
- **AND** no second `participantHandChanged` webhook is sent

### Requirement: Changes to one hand apply one at a time
Changes to the same hand SHALL apply one after the other across every replica, so simultaneous identical requests produce a single change, webhook and event. A change that cannot proceed because another one keeps the same hand busy SHALL answer 409.

#### Scenario: The same raise reaches two replicas
- **GIVEN** two Meet replicas sharing Redis and a participant with the hand down
- **WHEN** two raise requests for that hand arrive at the same time, each at a different replica
- **THEN** both answer 200
- **AND** the hand is raised once and exactly one `participantHandChanged` webhook is sent

### Requirement: Lower every hand
`PUT /api/v1/meetings/{roomId}/participants/hand` (`participantHandLowerAll`) with `raised: false` SHALL lower every raised hand in the meeting, the caller's and moderators' included, each as a moderator action. It SHALL require `participantHandLower`, reject `raised: true` with 422, answer 404 when the room has no meeting running, and succeed when a participant leaves while it runs.

#### Scenario: Every hand lowered
- **GIVEN** three participants with raised hands
- **WHEN** a client holding `participantHandLower` calls `participantHandLowerAll`
- **THEN** every hand is lowered
- **AND** one `participantHandChanged` webhook per hand is sent with `origin` `moderator`

#### Scenario: Raising every hand is rejected
- **WHEN** a client sends `raised: true` to `participantHandLowerAll`
- **THEN** the request answers 422

#### Scenario: Without the permission
- **GIVEN** a room member token without `participantHandLower`
- **WHEN** it calls `participantHandLowerAll`
- **THEN** the request answers 403

### Requirement: One queue for everyone
Raised hands SHALL form a single queue ordered by `handRaiseDate`, earliest first, with ties broken by participant identity, identical on every participant's screen. The REST snapshots of `participantList` and `participantGet` SHALL report each participant's `handRaised` and, while it is up, `handRaiseDate`.

#### Scenario: Queue order
- **GIVEN** Ana raised her hand before Ben
- **WHEN** any participant looks at the queue
- **THEN** Ana is first and Ben second
- **AND** when Ana lowers her hand, Ben becomes first on every screen

### Requirement: A hand does not outlive its participant
When a participant leaves with a raised hand, their hand SHALL leave the queue without any `participantHandChanged` webhook or event, the departure being reported by `participantLeft`. A participant joining again SHALL start with the hand lowered.

#### Scenario: Leaving with a raised hand
- **GIVEN** a participant with a raised hand
- **WHEN** they leave the meeting
- **THEN** the queue no longer holds their hand on any screen
- **AND** no `participantHandChanged` webhook is sent for it

### Requirement: participantHandChanged webhook
The server SHALL report every raise and every lower, once it is applied, with the `participantHandChanged` webhook, carrying the participant's live snapshot with the new hand state and `origin` (payload shape in `webhooks`): `participant` for a raise or a lower of the own hand, `moderator` for a lower made by anyone else.

#### Scenario: Own raise
- **WHEN** a participant raises their hand
- **THEN** a `participantHandChanged` webhook is sent with `participant.handRaised` true and `origin` `participant`

#### Scenario: Lowered by a moderator
- **WHEN** a moderator lowers a speaker's hand
- **THEN** a `participantHandChanged` webhook is sent with `participant.handRaised` false and `origin` `moderator`

### Requirement: participantHandChanged embedded event
The embedded element SHALL dispatch `participantHandChanged` to every participant, the one whose hand changed included, with the participant's live snapshot and the same `origin` as the webhook. A participant joining a meeting with raised hands SHALL receive one event per raised hand, in queue order, right after `meetingJoined`.

#### Scenario: Everyone is told
- **GIVEN** two embedded participants in a meeting
- **WHEN** one raises their hand
- **THEN** both hosts receive `participantHandChanged` with `participant.handRaised` true

#### Scenario: Late joiner gets the queue
- **GIVEN** a meeting where Ana and then Ben raised their hands
- **WHEN** an embedded participant joins
- **THEN** right after `meetingJoined` their host receives `participantHandChanged` for Ana and then for Ben

### Requirement: Raise hand commands
The embedded command `participantHandRaise()` SHALL raise the local participant's hand without any permission, rejected by the server while `raiseHand.enabled` is `false`. `participantHandLower(participantIdentity?)` SHALL lower the local participant's hand, or another participant's when an identity is given, which requires `participantHandLower`. `participantHandLowerAll()` SHALL lower every hand, gated by `participantHandLower`.

#### Scenario: Host raises and lowers the own hand
- **GIVEN** an embedded speaker in a meeting
- **WHEN** the host calls `participantHandRaise()` and then `participantHandLower()`
- **THEN** every participant sees the speaker's hand go up and then down

#### Scenario: Lowering another hand without the permission
- **GIVEN** an embedded speaker without `participantHandLower` and another participant with a raised hand
- **WHEN** the host calls `participantHandLower` with that participant's identity
- **THEN** the command is rejected and the hand stays raised

### Requirement: Raise hand from the toolbar and the keyboard
While raise hand is enabled, the meeting SHALL offer a Raise hand button in the toolbar, inside More options when the toolbar is compact (see `meeting-layout`), that raises or lowers the own hand. The `R` key SHALL do the same once per press, and SHALL be ignored while typing in a text field and with Ctrl, Cmd or Alt held.

#### Scenario: Holding the key down
- **GIVEN** a participant with the hand down
- **WHEN** they hold `R` down until the key repeats, then press it once more
- **THEN** the hand goes up once and then down once

#### Scenario: Typing in the chat
- **WHEN** a participant types a message containing "r" in the chat input
- **THEN** their hand does not change

### Requirement: Everyone sees the raised hands
Every participant SHALL see each raised hand highlighted on that participant's camera tile with their place in the queue, listed first in the participants panel in queue order with a hand on the avatar, and counted in the status rail, whose count opens the participants panel.

#### Scenario: A hand goes up
- **GIVEN** a meeting with three participants
- **WHEN** one of them raises their hand
- **THEN** every participant sees that participant's tile marked with position 1, their row first in the panel and a count of 1 in the status rail

### Requirement: Holders of participantHandLower are notified of raised hands
A holder of `participantHandLower` SHALL hear a sound and see a notice when another participant raises a hand. Hands raised while the notice is on screen SHALL join it ("Ana and 2 more raised their hand"); the notice SHALL shrink as those hands go down or leave, offer Lower hand while it names a single hand, last 5 seconds from its last change, and go away if the holder loses the permission.

#### Scenario: Several hands at once
- **GIVEN** a moderator holding `participantHandLower`
- **WHEN** Ana and then Ben raise their hands within a few seconds
- **THEN** the moderator sees a single notice "Ana and 1 more raised their hand"
- **AND** once Ana lowers her hand it reads "Ben raised their hand" and offers Lower hand

#### Scenario: Participant without the permission
- **GIVEN** a speaker without `participantHandLower`
- **WHEN** another participant raises their hand
- **THEN** the speaker gets no raised-hand notice

### Requirement: Lowering hands from the participants panel
A holder of `participantHandLower` SHALL find Lower hand in the row menu of each remote participant whose hand is up, and, while at least one remote participant's hand is up, a Raised hands strip heading the panel with the number of raised hands and a Lower all hands button. Every participant with a raised hand SHALL find a button on their own row to lower it.

#### Scenario: Lower all from the strip
- **GIVEN** a moderator holding `participantHandLower` and two speakers with raised hands
- **WHEN** the moderator presses Lower all hands in the panel
- **THEN** both hands are lowered

#### Scenario: Only the own hand is up
- **GIVEN** a moderator whose own hand is the only one raised
- **WHEN** they open the participants panel
- **THEN** no Raised hands strip is shown and their own row offers to lower their hand

### Requirement: A participant is told when someone else lowers their hand
A participant whose hand is lowered by someone else SHALL see "A moderator lowered your hand".

#### Scenario: Moderator lowers a hand
- **WHEN** a moderator lowers a speaker's raised hand
- **THEN** the speaker sees "A moderator lowered your hand"
