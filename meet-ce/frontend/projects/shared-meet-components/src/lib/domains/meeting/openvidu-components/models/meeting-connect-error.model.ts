/** Why joining the meeting failed, as reported by {@link MeetingLiveKitService.connect}. */
export type MeetingConnectErrorCode = 'MEETING_FULL' | 'CONNECTION_ERROR';

/**
 * A failed attempt to join the meeting, keeping the underlying LiveKit failure as its `cause` so a
 * connection problem can still be diagnosed from the message shown to the participant.
 */
export class MeetingConnectError extends Error {
	constructor(
		readonly code: MeetingConnectErrorCode,
		message: string,
		cause?: unknown
	) {
		super(message, { cause });
		this.name = 'MeetingConnectError';
	}
}
