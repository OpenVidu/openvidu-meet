/**
 * Reason for emitting the LEFT event in OpenVidu Meet.
 */
export enum LeftEventReason {
	/** The participant left the meeting voluntarily */
	VOLUNTARY_LEAVE = 'voluntary_leave',
	/** The participant was disconnected due to network issues */
	NETWORK_DISCONNECT = 'network_disconnect',
	/** The server was shut down unexpectedly */
	SERVER_SHUTDOWN = 'server_shutdown',
	/** The participant was kicked from the meeting by a moderator */
	PARTICIPANT_KICKED = 'participant_kicked',
	/**
	 * The meeting was ended for everyone by someone or something other than the local participant:
	 * another participant, the `meetingEnd` REST operation or command of another participant, or the
	 * forced deletion or closing of its room. It is also the only end reason `participantLeft` carries.
	 */
	MEETING_ENDED = 'meeting_ended',
	/** The local participant ended the meeting for all participants */
	MEETING_ENDED_BY_SELF = 'meeting_ended_by_self',
	/** The meeting was automatically ended because it reached its configured maximum duration */
	MEETING_ENDED_BY_DURATION_LIMIT = 'meeting_ended_by_duration_limit',
	/** The participant was disconnected because the same identity joined again */
	DUPLICATE_IDENTITY = 'duplicate_identity',
	/** Unknown reason for leaving the meeting */
	UNKNOWN = 'unknown'
}
