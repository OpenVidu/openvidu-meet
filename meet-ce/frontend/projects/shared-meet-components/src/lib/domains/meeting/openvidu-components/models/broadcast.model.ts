import type {
	MeetBroadcastDestinationInfo,
	MeetBroadcastDestinationOptions,
	MeetBroadcastStartDestination
} from '@openvidu-meet/typings';
import { MeetBroadcastDestinationStatus, MeetBroadcastStatus } from '@openvidu-meet/typings';
import type { DistributiveOmit } from '../../../../shared/utils/object.utils';

/**
 * What the live broadcast activity asks of the meeting: the one output it emits, narrowed on
 * `action`. The panel never calls the API itself, the meeting page answers each request.
 */
export type BroadcastRequestedEvent =
	| { action: 'start'; roomId: string; destinations?: MeetBroadcastStartDestination[] }
	| { action: 'stop'; roomId: string; broadcastId: string }
	| { action: 'addDestination'; roomId: string; broadcastId: string; destination: MeetBroadcastDestinationOptions }
	| { action: 'updateDestination'; roomId: string; broadcastId: string; destinationId: string; active: boolean };

/**
 * What the local participant last asked of the broadcast while the server has not answered, or
 * that the answer was a refusal. The server's own answer arrives as a broadcast signal and clears it.
 */
export type BroadcastRequestStatus = 'idle' | 'starting' | 'stopping' | 'updating' | 'failed';

export interface BroadcastRequestState {
	status: BroadcastRequestStatus;
	error?: string;
}

/** A request as the activity builds it, before the room id every one of them carries is added. */
export type BroadcastRequest = DistributiveOmit<BroadcastRequestedEvent, 'roomId'>;

/** What the local participant is told while each kind of request is in flight. */
export const BROADCAST_REQUEST_STATUS_BY_ACTION: Record<BroadcastRequestedEvent['action'], BroadcastRequestStatus> = {
	start: 'starting',
	stop: 'stopping',
	addDestination: 'updating',
	updateDestination: 'updating'
};

/** The broadcast as the activity shows it: what the row says and offers depends on the phase alone. */
export type BroadcastPhase = 'idle' | 'starting' | 'live' | 'ending' | 'failed';

const IN_PROGRESS_STATUSES = [MeetBroadcastStatus.STARTING, MeetBroadcastStatus.ACTIVE, MeetBroadcastStatus.ENDING];
const RUNNING_STATUSES = [MeetBroadcastStatus.STARTING, MeetBroadcastStatus.ACTIVE];
const STREAMING_STATUSES = [MeetBroadcastDestinationStatus.CONNECTING, MeetBroadcastDestinationStatus.ACTIVE];

/** Whether the broadcast is still the meeting's current one: not over yet, if only just ending. */
export const isBroadcastInProgress = (status: MeetBroadcastStatus): boolean => IN_PROGRESS_STATUSES.includes(status);

/** Whether the broadcast can still be stopped or have its destinations changed. */
export const isBroadcastRunning = (status: MeetBroadcastStatus): boolean => RUNNING_STATUSES.includes(status);

/** Whether the destination is streamed to, whether or not media has reached it yet. */
export const isDestinationStreaming = ({ status }: MeetBroadcastDestinationInfo): boolean =>
	STREAMING_STATUSES.includes(status);
