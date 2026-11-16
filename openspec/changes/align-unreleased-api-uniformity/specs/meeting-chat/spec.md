## MODIFIED Requirements

### Requirement: Room chat switch

A room's `config.chat.enabled` SHALL turn the chat on or off for every participant of its meetings, whatever their permissions, and SHALL default to `true` when a room is created without it. When it can be changed is defined in `room-config`.

#### Scenario: Room created without chat config

- **GIVEN** a room created through `roomCreate` without `config.chat`
- **WHEN** its config is read with `roomGetConfig`
- **THEN** `chat.enabled` is `true`

#### Scenario: Chat disabled

- **GIVEN** a room with `config.chat.enabled` false
- **WHEN** a moderator holding `chatRead` and `chatWrite` joins its meeting
- **THEN** the toolbar shows no chat button and no chat panel can be opened
