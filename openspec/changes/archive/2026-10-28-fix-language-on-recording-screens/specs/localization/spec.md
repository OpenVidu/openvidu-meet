## MODIFIED Requirements

### Requirement: Language requested by the host
The `language` attribute or query parameter SHALL set the language an entry starts in, whether it opens a meeting or a recording screen, from a room URL or a recording URL, in the embedded element, the iframe and the direct link alike, over the participant's stored preference, without replacing that preference: an entry without `language` SHALL use the stored preference again.

#### Scenario: Requested language wins for the entry
- **GIVEN** a participant whose stored preference is German
- **WHEN** an embedded element enters a room with `language="es"`
- **THEN** the device setup screen is in Spanish
- **AND** a later entry without `language` is in German again

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
