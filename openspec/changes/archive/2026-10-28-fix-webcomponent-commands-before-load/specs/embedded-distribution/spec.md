## MODIFIED Requirements

### Requirement: Calls made before the bundle loads are kept
The embedded element SHALL keep the attributes and properties a host sets and the listeners it registers before the full bundle has loaded. Once loaded, it SHALL apply the last value written to each attribute or property and deliver later events to those listeners. A command method called before the full bundle has loaded, or before the element's Meet has started, SHALL be rejected at once with a console warning naming the command, and SHALL NOT run later.

#### Scenario: Listener registered before the load
- **GIVEN** a host that calls `element.on("meetingJoined", callback)` right after creating the element
- **WHEN** the bundle loads and the participant joins
- **THEN** the callback receives the `meetingJoined` payload

#### Scenario: Property read before the load
- **WHEN** a host sets `element.participantName = "Bob"` and reads it back before the bundle has loaded
- **THEN** it reads `Bob`

#### Scenario: Command called before the load
- **GIVEN** an element whose full bundle is still loading
- **WHEN** the host calls `element.mediaToggleVideo(false)`
- **THEN** the call returns without an exception and the browser console warns that `mediaToggleVideo` was rejected
- **AND** the camera is on when the participant later reaches the device setup screen of a room whose `config.initialVideoActive` is true
