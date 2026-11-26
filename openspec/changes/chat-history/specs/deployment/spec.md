# Spec Delta

## ADDED Requirements

### Requirement: Meet joins meetings that save their chat
To save the chat of a meeting (see `meeting-chat`), Meet SHALL join it through `LIVEKIT_URL_PRIVATE` with a WebRTC connection of its own, carrying no media, so the server SHALL reach the media server's WebRTC ports the way a browser does. When it cannot, the meeting and its live chat SHALL go on unsaved and the server SHALL log an error naming the room on each failed join.

#### Scenario: Meeting hosted on a media node
- **GIVEN** an OpenVidu Elastic deployment whose meeting of a room that saves its chat runs on a media node
- **WHEN** a participant sends a message
- **THEN** the Meet server, on the master node, receives it through its own connection to that media node and stores it

#### Scenario: Media server unreachable over WebRTC
- **GIVEN** a deployment where the Meet server cannot reach the media server's WebRTC ports
- **WHEN** a meeting of a room that saves its chat takes place
- **THEN** the meeting and its live chat work, no message is stored, and the server logs an error naming the room each time it fails to join
