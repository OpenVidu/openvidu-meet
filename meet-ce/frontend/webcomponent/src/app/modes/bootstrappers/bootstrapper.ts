import type { OpenViduMeetErrorDetail } from '../../api/events';
import type { ModeInputs } from '../mode';

/**
 * Outcome of a single mode bootstrap. The `error` variant carries the same
 * detail shape that the WC's typed `error` event surfaces to hosts — keeping
 * one representation across the boundary so App doesn't have to translate.
 */
export type ModeBootstrapResult = { kind: 'ready' } | { kind: 'error'; detail: OpenViduMeetErrorDetail };

/**
 * One-method strategy. Each mode implements a bootstrapper that:
 * 1. Reads the input attributes it cares about,
 * 2. Calls the matching `*EntryService` from `@openvidu-meet/shared-components`,
 * 3. Returns a {@link ModeBootstrapResult} — never throws.
 *
 * The {@link ModeCoordinatorService} selects which bootstrapper to invoke based
 * on the resolved {@link import('../mode').Mode}.
 */
export interface ModeBootstrapper {
	bootstrap(inputs: ModeInputs): Promise<ModeBootstrapResult>;
}
