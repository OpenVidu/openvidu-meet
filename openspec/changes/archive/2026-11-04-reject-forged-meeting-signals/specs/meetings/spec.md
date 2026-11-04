# Spec Delta

## ADDED Requirements

### Requirement: Server signals are honored only from the server
A participant's meeting SHALL act on a server meeting signal (recording state, moderator mute, relayed reaction, permission refresh) only when the media server delivers it as sent by the server: with no participant as sender and not end-to-end encrypted. Any other packet on those topics SHALL be ignored, whether or not the receiver lists its sender, in rooms with and without end-to-end encryption.

#### Scenario: Server signal applied
- **GIVEN** a meeting with two participants
- **WHEN** a moderator starts the recording
- **THEN** both participants' meetings show the recording as active

#### Scenario: Forged signal from a listed participant
- **GIVEN** a speaker able to send data messages in a meeting
- **WHEN** they publish a message imitating the server's recording state with the recording active
- **THEN** no participant's meeting shows the recording as active

#### Scenario: Forged signal from a participant the receiver does not list yet
- **GIVEN** a participant who connected to the meeting and publishes before the others' meetings list them
- **WHEN** they publish a message imitating a moderator mute addressed to everyone
- **THEN** no participant's device is turned off and no mute notice is shown

#### Scenario: Forged encrypted signal in an encrypted room
- **GIVEN** a room with end-to-end encryption and a participant holding its key
- **WHEN** they publish, encrypted with the meeting key, a message imitating a relayed reaction of another participant
- **THEN** no participant shows that reaction

#### Scenario: Forged unencrypted signal in an encrypted room
- **GIVEN** a room with end-to-end encryption and a participant able to send data messages
- **WHEN** they publish, without encryption, a message imitating the server's recording state
- **THEN** no participant's meeting changes its recording state
