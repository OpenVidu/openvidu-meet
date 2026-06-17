import type { OpenViduMeetErrorDetail } from '../../api/events';
import type { ModeInputs } from '../mode';

export type ModeBootstrapResult = { kind: 'ready' } | { kind: 'error'; detail: OpenViduMeetErrorDetail };

export interface ModeBootstrapper {
	bootstrap(inputs: ModeInputs): Promise<ModeBootstrapResult>;
}
