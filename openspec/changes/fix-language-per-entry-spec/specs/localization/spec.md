## MODIFIED Requirements

### Requirement: Language requested by the host
The `language` attribute or query parameter SHALL set the interface language when it is set or changed, whether the page shows a meeting or a recording screen, from a room URL or a recording URL, in the embedded element, the iframe and the direct link alike, over the participant's stored preference, without replacing that preference. Removing `language` SHALL restore the stored preference. It SHALL NOT be applied again at each entry.

#### Scenario: Requested language wins for the entry
- **GIVEN** a participant whose stored preference is German
- **WHEN** an embedded element enters a room with `language="es"`
- **THEN** the device setup screen is in Spanish
- **AND** once `language` is removed from the element the interface is in German again

#### Scenario: Iframe query parameter
- **GIVEN** an iframe whose `src` carries `language=es-ES`
- **WHEN** it reaches the device setup screen
- **THEN** the screen is in Spanish

#### Scenario: Recording screen in the embedded element
- **GIVEN** a browser whose stored preference is German
- **WHEN** an embedded element is given a `recording-url` and `language="fr"`
- **THEN** the recording view is in French

#### Scenario: Room recordings page in the embedded element
- **GIVEN** an embedded element that entered a meeting with `language="es"` and was then given `show-only-recordings` without `language`, in a browser whose stored preference is German
- **WHEN** the room recordings page is shown
- **THEN** it is in German

#### Scenario: Recording URL in an iframe
- **GIVEN** an iframe whose `src` is a recording URL carrying `language=ja`
- **WHEN** the recording view is shown
- **THEN** it is in Japanese

#### Scenario: Navigation inside an iframe
- **GIVEN** an iframe whose `src` carries `language=es` and `show-only-recordings=true`
- **WHEN** the participant goes from the room recordings page back to the room
- **THEN** the join screen is in Spanish

#### Scenario: Participant's choice kept for another room
- **GIVEN** an element with `language="es"` whose participant chose Deutsch on the device setup screen
- **WHEN** the host sets `room-url` to another room without changing `language`
- **THEN** the new room starts in German
