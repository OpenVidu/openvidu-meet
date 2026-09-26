import type { MeetBroadcastDestinationOptions, MeetBroadcastStartDestination } from '@openvidu-meet/typings';

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
