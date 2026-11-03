## MODIFIED Requirements

### Requirement: Live broadcast in the room wizard
The console room wizard SHALL offer a Live broadcast step with the switch, the default destinations to add, edit and remove, and the layout. A saved stream key SHALL never be shown, and an edited destination SHALL keep it while its URL is left as served. The editor SHALL save onto the destination it was opened on, whatever other rows are removed meanwhile. Finishing SHALL be blocked while live broadcast is allowed without a destination.

#### Scenario: Allowed without a destination
- **GIVEN** a user creating a room in the wizard
- **WHEN** they allow live broadcast and add no destination
- **THEN** the step asks for at least one destination and the finish button is disabled

#### Scenario: Destination renamed
- **GIVEN** a room with a saved destination
- **WHEN** its owner edits the room, renames the destination, leaves its URL as shown and saves
- **THEN** the destination keeps its stream key under the new name

#### Scenario: Row removed while another is edited
- **GIVEN** a room with destinations A, B and C open in the wizard
- **WHEN** its owner edits C, removes A, renames C, saves the editor and finishes
- **THEN** the room keeps B unchanged and C under the new name with its stream key
