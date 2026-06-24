import type { WebComponentPropertyValues } from '@openvidu-meet/typings';
import type { OpenViduMeetErrorDetail } from '../../api/events';

export type ModeBootstrapResult = { kind: 'ready' } | { kind: 'error'; detail: OpenViduMeetErrorDetail };

export interface ModeBootstrapper {
	bootstrap(inputs: Required<WebComponentPropertyValues>): Promise<ModeBootstrapResult>;
}
