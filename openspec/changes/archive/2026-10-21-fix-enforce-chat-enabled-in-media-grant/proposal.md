# Proposal

## Why

A room's `config.chat.enabled` `false` only hides the chat in the interface: the media server grant allows
publishing data to every participant holding `chatWrite`, so a modified client still sends chat messages
that every other client receives, in a room whose manager turned chat off.

## What Changes

- The media server grant allows publishing data only when the participant holds `chatWrite` **and** the
  room's `config.chat.enabled` is `true`, at join time and every time the grant is rebuilt during the
  meeting (token regeneration, promotion, demotion).
- The room config cannot change during a meeting (`room-config` "Config fixed during a meeting"), so the
  grant given at join stays right for the whole meeting.
- The OpenAPI description of `chat.enabled` states that the server enforces it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `meeting-chat`: "Server enforcement of chatWrite" also requires `config.chat.enabled`, with scenarios for
  a room without chat.

## Impact

- Media server grant of join tokens; no REST, webhook or embedded API contract change. The OpenAPI
  description of `MeetChatConfig.enabled` (`meet-ce/backend/openapi/rooms/schemas/meet-room-config.yaml`)
  and the TSDoc of `MeetChatConfig.enabled` (`meet-ce/typings/src/database/room-config.ts`) are reworded.
- Meeting UI: none (it already hides the chat).
- Console UI, deployment configuration: none.
- Code: `meet-ce/backend/src/services/room-member.service.ts` (the publish grant and every path that
  builds it).
- openvidu.io: none (`docs/meet/features/meetings/configuration.md` only lists chat as a toggle).

## Decisions to confirm

- Chat is the only data the meeting client publishes today, so turning the data grant off is safe; a future
  feature that needs client-published data in a room without chat would need its own grant rule.
  Alternative: keep `chat.enabled` UI-only and document it as such in the OpenAPI.
