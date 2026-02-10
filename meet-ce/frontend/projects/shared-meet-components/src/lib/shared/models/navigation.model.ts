export enum NavigationErrorReason {
	CLOSED_ROOM = 'closed-room',
	ANONYMOUS_ACCESS_DISABLED = 'anonymous-access-disabled',
	INVALID_ROOM_SECRET = 'invalid-room-secret',
	INVALID_RECORDING_SECRET = 'invalid-recording-secret',
	INVALID_ROOM = 'invalid-room',
	INVALID_RECORDING = 'invalid-recording',
	INVALID_MEMBER = 'invalid-member',
	FORBIDDEN_ROOM_ACCESS = 'forbidden-room-access',
	FORBIDDEN_RECORDING_ACCESS = 'forbidden-recording-access',
	INTERNAL_ERROR = 'internal-error'
}
