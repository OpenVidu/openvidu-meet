## MODIFIED Requirements

### Requirement: Holders of participantHandLower are notified of raised hands
A holder of `participantHandLower` SHALL hear a sound and see a notice when another participant raises a hand. Hands raised while the notice is on screen SHALL join it ("Ana and 2 more raised their hand"); the notice SHALL shrink as those hands go down or leave, offer Lower hand while it names a single hand, last 5 seconds from its last change, and go away if the holder loses the permission or leaves the meeting.

#### Scenario: Several hands at once
- **GIVEN** a moderator holding `participantHandLower`
- **WHEN** Ana and then Ben raise their hands within a few seconds
- **THEN** the moderator sees a single notice "Ana and 1 more raised their hand"
- **AND** once Ana lowers her hand it reads "Ben raised their hand" and offers Lower hand

#### Scenario: Participant without the permission
- **GIVEN** a speaker without `participantHandLower`
- **WHEN** another participant raises their hand
- **THEN** the speaker gets no raised-hand notice

#### Scenario: Holder leaves with the notice on screen
- **GIVEN** a moderator holding `participantHandLower` who sees the notice "Ana raised their hand"
- **WHEN** they leave the meeting within 5 seconds
- **THEN** the end screen shows no raised-hand notice
