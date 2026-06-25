OpenVidu Meet — WebComponent Public API Reference
==================================================

This document describes the public API of the `<openvidu-meet>` custom element.

## HTML Attributes / Properties

| Attribute               | Property            | Type      | Description |
|-------------------------|---------------------|-----------|-------------|
| `room-url`              | `roomUrl`           | `string`  | Room URL. Required unless `recording-url` is provided. |
| `recording-url`         | `recordingUrl`      | `string`  | Recording URL. When provided, `room-url` is not required. |
| `participant-name`      | `participantName`   | `string`  | Display name for the local participant. |
| `e2ee-key`              | `e2eeKey`           | `string`  | E2EE secret key. |
| `leave-redirect-url`    | `leaveRedirectUrl`  | `string`  | URL to redirect to after the `closed` event fires. |
| `show-only-recordings`  | `showOnlyRecordings`| `boolean` | Show only recordings when `true`. |
| `show-recording`        | `showRecording`     | `string`  | Recording ID to open directly. |

## Events

| Event    | `CustomEvent.detail` type         | Description |
|----------|-----------------------------------|-------------|
| `joined` | `OpenViduMeetJoinedDetail`        | Local participant joined the room. |
| `left`   | `OpenViduMeetLeftDetail`          | Local participant left the room. |
| `closed` | `OpenViduMeetClosedDetail` (`{}`) | Application fully closed. |

### `OpenViduMeetJoinedDetail`
```ts
interface OpenViduMeetJoinedDetail {
  roomId: string;
  participantIdentity: string;
}
```

### `OpenViduMeetLeftDetail`
```ts
interface OpenViduMeetLeftDetail {
  roomId: string;
  participantIdentity: string;
  reason: 'voluntary_leave' | 'network_disconnect' | 'server_shutdown'
        | 'participant_kicked' | 'meeting_ended' | 'meeting_ended_by_self'
        | 'duplicate_identity' | 'unknown';
}
```

## Imperative Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `endMeeting` | `endMeeting(): void` | Ends the meeting for all participants. Moderator only. |
| `leaveRoom` | `leaveRoom(): void` | Disconnects the local participant. |
| `kickParticipant` | `kickParticipant(identity: string): void` | Kicks a participant. Moderator only. |

## Slots

| Slot name   | Description |
|-------------|-------------|
| `toolbar`   | Replaces the default toolbar. |
| `side`      | Adds a side panel to the meeting layout. |
| `main`      | Replaces the entire main meeting area. |
| `layout`    | Advanced: elements with `slot="participant-{id}"` receive injected VideoTile components. |
