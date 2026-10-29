# Localization Specification

## Purpose

The languages Meet's interface is shown in, how a person chooses one and keeps it, and how a host
application embedding a meeting imposes the starting language or keeps the participant from changing it.
Participants, console users and host applications serving an international audience rely on it.

Surfaces: the language selectors of the meeting (device setup screen and settings panel) and of the
console toolbar, and the embedded attributes `language` and `show-language-selector`, also accepted
as query parameters of a room URL in a direct link or an iframe (TSDoc in
`meet-ce/typings/src/embedded/attributes.ts`). Documented in openvidu.io
`docs/meet/embedded/reference/webcomponent.md`, `docs/meet/embedded/reference/iframe.md` and
`docs/meet/embedded/reference/direct-link.md`.

## Requirements

### Requirement: Supported languages
Meet SHALL offer its interface, the meeting, the console and the screens shown inside an embedded element alike, in English, Spanish, German, French, Simplified Chinese, Hindi, Italian, Japanese, Dutch and European Portuguese, each listed in the selectors under its own name.

#### Scenario: Language selector options
- **GIVEN** a participant on the device setup screen
- **WHEN** they open the language selector
- **THEN** it lists English, Español, Deutsch, Français, 中文, हिन्दी, Italiano, 日本語, Nederlands and Português

### Requirement: English by default
Without a stored choice and without `language`, Meet SHALL show its interface in English, whatever the browser's language.

#### Scenario: First visit from a German browser
- **GIVEN** a browser set to German that never chose a language in Meet
- **WHEN** it opens an anonymous room link without `language`
- **THEN** the meeting is shown in English

### Requirement: Language selectors
The meeting SHALL offer a language selector on the device setup screen and in the General tab of the settings panel, and the console SHALL offer one in its toolbar.

#### Scenario: Selector in the meeting
- **GIVEN** a participant in a meeting
- **WHEN** they open the settings panel on its General tab
- **THEN** a language selector is shown

#### Scenario: Selector in the console
- **GIVEN** a signed-in user on any console page
- **WHEN** they look at the console toolbar
- **THEN** a language selector is shown

### Requirement: Choosing a language
Choosing a language in any selector SHALL apply it at once to everything on screen, without reloading the page or leaving the meeting.

#### Scenario: Switching on the device setup screen
- **GIVEN** a participant on the device setup screen shown in Spanish
- **WHEN** they choose Deutsch in the language selector
- **THEN** the join button reads `Meeting beitreten` without the page reloading

### Requirement: Shared language preference
A language chosen in a selector SHALL be remembered in the browser as the person's preference, shared by the console and the meeting, and SHALL apply to their later visits and entries.

#### Scenario: Chosen in the console
- **GIVEN** a user who chose Español in the console
- **WHEN** they enter a meeting from the console
- **THEN** the meeting is shown in Spanish

#### Scenario: Chosen in a meeting
- **GIVEN** a participant who chose Deutsch on the device setup screen and joined
- **WHEN** they enter another meeting in the same browser without `language`
- **THEN** that meeting is shown in German

### Requirement: Untranslated text falls back to English
A text with no translation in the selected language SHALL be shown in English rather than left blank.

#### Scenario: Missing translation
- **GIVEN** a selected language that lacks the translation of a text
- **WHEN** that text is shown
- **THEN** it is shown in English and the rest of the screen stays in the selected language

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

### Requirement: Language tag matching
`language` SHALL accept a BCP 47 tag, case-insensitively, matching a supported language by its full tag or else by its language subtag, with `zh` for Simplified Chinese and `pt` for European Portuguese, so `pt-BR` selects `pt` and `zh-CN` selects Simplified Chinese. An unsupported value SHALL be ignored, with a browser console warning, and the stored preference applies.

#### Scenario: Region variant
- **GIVEN** an entry with `language="pt-BR"`
- **WHEN** the meeting is shown
- **THEN** it is in European Portuguese

#### Scenario: Unsupported language
- **GIVEN** a browser without a stored preference
- **WHEN** an entry has `language="xx"`
- **THEN** the meeting is shown in English and the browser console warns that `xx` is unsupported

### Requirement: Browser language on request
`language` set to `auto` SHALL start the entry in the first of the browser's preferred languages that Meet supports, and in English when none is supported, ignoring the stored preference.

#### Scenario: German browser
- **GIVEN** a browser whose preferred language is `de-DE`
- **WHEN** an entry has `language="auto"`
- **THEN** the meeting is shown in German

#### Scenario: Unsupported browser language
- **GIVEN** a browser whose preferred language is `ko-KR` and whose stored preference is German
- **WHEN** an entry has `language="auto"`
- **THEN** the meeting is shown in English

### Requirement: Participant can still change the language
With `language` set, the participant SHALL still be able to change the language from the meeting's selectors, unless `show-language-selector` hides them; such a change is remembered as their preference.

#### Scenario: Changing a requested language
- **GIVEN** an entry with `language="es"`
- **WHEN** the participant chooses Deutsch on the device setup screen
- **THEN** the screen switches to German

### Requirement: Hiding the language selectors
`show-language-selector` read as `false` (boolean rule in `embedded-api`) SHALL hide both language selectors of the meeting, on the device setup screen and in the settings panel; otherwise, its absence included, they SHALL be shown. The value SHALL apply to each entry on its own.

#### Scenario: Selectors hidden
- **GIVEN** an embedded element with `language="es"` and `show-language-selector="false"`
- **WHEN** the participant reaches the device setup screen and later opens the settings panel in the meeting
- **THEN** neither shows a language selector and the meeting stays in Spanish

#### Scenario: Iframe query parameter
- **GIVEN** an iframe whose `src` carries `show-language-selector=false`
- **WHEN** it reaches the device setup screen
- **THEN** no language selector is shown

#### Scenario: Next entry without the attribute
- **GIVEN** an entry that hid the selectors
- **WHEN** the same element enters again without `show-language-selector`
- **THEN** the selectors are shown

### Requirement: Screens and notices follow the language
Every screen of the meeting, the join, device setup, meeting, end and access error screens, and every notice raised during the meeting, such as a received message, a raised hand, a recording starting or stopping, or the participant's role changing, SHALL be shown in the selected language and follow a change of language while on screen.

#### Scenario: Role change notice
- **GIVEN** a participant in a meeting shown in Spanish
- **WHEN** a moderator promotes them
- **THEN** the promotion notice is in Spanish

#### Scenario: Error screen
- **GIVEN** a browser whose preferred Meet language is French
- **WHEN** it opens a link with an unknown secret
- **THEN** the "Invalid link" error screen is shown in French

### Requirement: Integration payloads do not depend on the language
The embedded events, the webhooks and the REST API SHALL carry no translated text: their values are codes and names that stay the same whatever language a participant has selected.

#### Scenario: Leave reason in a translated meeting
- **GIVEN** an embedded element whose participant has the meeting in Japanese
- **WHEN** they leave the meeting
- **THEN** `meetingLeft` carries `reason` `voluntary_leave`
