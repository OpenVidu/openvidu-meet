## MODIFIED Requirements

### Requirement: Status rail
A status rail SHALL sit above the layout, in a row of its own that never covers the video, whenever there is a meeting-wide status. It SHALL hold the elapsed time and forced-end countdown, the recording mark, the live broadcast mark, the encryption mark, the raised hands count, the reactions pulse and the hidden participants indicator, each specified by its feature. The recording and live broadcast marks SHALL open the activities panel; the hands, pulse and indicator, the participants panel.

#### Scenario: Recording in progress
- **GIVEN** a meeting being recorded
- **WHEN** the participant clicks the recording mark in the status rail
- **THEN** the activities panel opens on the recording

#### Scenario: Live broadcast in progress
- **GIVEN** a meeting streaming to a destination
- **WHEN** the participant clicks the live broadcast mark in the status rail
- **THEN** the activities panel opens on the live broadcast

#### Scenario: Desktop countdown
- **GIVEN** a desktop meeting window and a meeting close to its maximum duration
- **WHEN** the countdown starts
- **THEN** the status rail shows the countdown next to the elapsed time
