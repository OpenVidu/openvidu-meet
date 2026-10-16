import type { MeetBroadcastInfo, MeetBroadcastStartDestination } from '@openvidu-meet/typings';
import { MeetBroadcastStatus } from '@openvidu-meet/typings';
import type { DistributiveOmit } from '../../../../shared/utils/object.utils';

/**
 * What the live broadcast activity asks of the meeting: the one output it emits, narrowed on
 * `action`. A meeting runs one broadcast per destination, so a request names the destinations to
 * start streaming to, or the broadcasts to stop; naming none means every room destination not
 * streamed to yet, or every running broadcast. The panel never calls the API itself, the meeting
 * page answers each request.
 */
export type BroadcastRequestedEvent =
	| { action: 'start'; roomId: string; destinations?: MeetBroadcastStartDestination[] }
	| { action: 'stop'; roomId: string; broadcastIds?: string[] };

/**
 * What the local participant last asked of the broadcasts while the server has not answered, or
 * that the answer was a refusal.
 */
export type BroadcastRequestStatus = 'idle' | 'starting' | 'stopping' | 'failed';

export interface BroadcastRequestState {
	status: BroadcastRequestStatus;
	error?: string;
}

/** A request as the activity builds it, before the room id every one of them carries is added. */
export type BroadcastRequest = DistributiveOmit<BroadcastRequestedEvent, 'roomId'>;

/** What the local participant is told while each kind of request is in flight. */
export const BROADCAST_REQUEST_STATUS_BY_ACTION: Record<BroadcastRequestedEvent['action'], BroadcastRequestStatus> = {
	start: 'starting',
	stop: 'stopping'
};

/** The meeting's broadcasts as the activity shows them: what the row says and offers depends on the phase alone. */
export type BroadcastPhase = 'idle' | 'starting' | 'live' | 'ending' | 'failed';

const IN_PROGRESS_STATUSES = [MeetBroadcastStatus.STARTING, MeetBroadcastStatus.ACTIVE, MeetBroadcastStatus.ENDING];
const RUNNING_STATUSES = [MeetBroadcastStatus.STARTING, MeetBroadcastStatus.ACTIVE];
const FAILED_STATUSES = [MeetBroadcastStatus.FAILED, MeetBroadcastStatus.LIMIT_REACHED];

/** Whether the broadcast is still one of the meeting's current ones: not over yet, if only just ending. */
export const isBroadcastInProgress = (status: MeetBroadcastStatus): boolean => IN_PROGRESS_STATUSES.includes(status);

/** Whether the broadcast can still be stopped. */
export const isBroadcastRunning = (status: MeetBroadcastStatus): boolean => RUNNING_STATUSES.includes(status);

/** Whether the broadcast ended in a failure the activity should say something about. */
export const hasBroadcastFailed = (status: MeetBroadcastStatus): boolean => FAILED_STATUSES.includes(status);

/** How far a broadcast went: starting, active, ending and over, in that order. A broadcast only moves forward. */
export const broadcastProgress = (status: MeetBroadcastStatus): number =>
	isBroadcastInProgress(status) ? IN_PROGRESS_STATUSES.indexOf(status) : IN_PROGRESS_STATUSES.length;

/**
 * A broadcast the server will say nothing more of, settled as the server settles one: complete if
 * media reached its destination, aborted otherwise.
 */
export const settleBroadcast = (broadcast: MeetBroadcastInfo, now = Date.now()): MeetBroadcastInfo =>
	broadcast.startDate
		? {
				...broadcast,
				status: MeetBroadcastStatus.COMPLETE,
				endDate: now,
				duration: (now - broadcast.startDate) / 1000
			}
		: { ...broadcast, status: MeetBroadcastStatus.ABORTED };

/**
 * What tells the broadcasts to one destination from those to another: the room destination they
 * stream to, or the name and URL of a destination given for the meeting, since the redacted URL
 * alone is the same for every destination on one platform.
 */
export const broadcastDestinationKey = ({
	destinationId,
	name,
	url
}: Pick<MeetBroadcastInfo, 'destinationId' | 'name' | 'url'>): string => destinationId ?? `${name}\n${url}`;
