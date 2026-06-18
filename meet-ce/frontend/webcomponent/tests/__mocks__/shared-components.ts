// Lightweight stand-in for the heavy `@openvidu-meet/shared-components` barrel in unit tests.
//
// The real barrel pulls in Angular, Material and LiveKit, which the jsdom unit tests
// neither need nor can load. The only runtime value the units under test reference is
// the `WebComponentNavigationType` enum (via `mode.ts`), so we re-export it straight
// from the real, Angular-free model file. Sourcing it from the original keeps the enum
// values from drifting out of sync with production code.
export { WebComponentNavigationType } from '../../../projects/shared-meet-components/src/lib/shared/models/webcomponent-bridge.model';
