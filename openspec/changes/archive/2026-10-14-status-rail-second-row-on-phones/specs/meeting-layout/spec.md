## MODIFIED Requirements

### Requirement: Status rail on phones
In a meeting 790 px wide or narrower, every chip of the status rail SHALL stay visible without its words, none off screen, and no Meeting status menu SHALL exist. The rail SHALL keep one row, laid out as on desktop, while its chips fit, and SHALL move the raised hands count, the reactions pulse and the hidden participants indicator to a second row below only when they do not; that row SHALL show as many reactions as fit, most common first.

#### Scenario: Encrypted meeting on a phone
- **GIVEN** an end-to-end encrypted meeting in a 320 px wide window
- **WHEN** the participant looks at the status rail
- **THEN** no chip is outside the screen and the encryption mark is in the rail

#### Scenario: Chips that fit stay in one row
- **GIVEN** a meeting in a 390 px wide window with a raised hand, a reaction and hidden participants
- **WHEN** the participant looks at the status rail
- **THEN** the raised hands count, the reactions pulse and the hidden participants indicator share the row of the elapsed time

#### Scenario: Chips that do not fit use a second row
- **GIVEN** the same meeting in a 220 px wide window
- **WHEN** the participant looks at the status rail
- **THEN** the elapsed time, the recording mark and the encryption mark stay in the first row
- **AND** the raised hands count, the reactions pulse and the hidden participants indicator move to a second row below it

#### Scenario: Countdown on a phone
- **GIVEN** a meeting close to its maximum duration in a 360 px wide window
- **WHEN** the countdown starts
- **THEN** the rail shows the countdown instead of the elapsed time
