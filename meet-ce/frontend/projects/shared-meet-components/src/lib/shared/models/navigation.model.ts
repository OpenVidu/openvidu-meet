export enum NavigationErrorReason {
	CLOSED_ROOM = 'closed-room',
	MISSING_ROOM_SECRET = 'missing-room-secret',
	MISSING_RECORDING_SECRET = 'missing-recording-secret',
	INVALID_ROOM_SECRET = 'invalid-room-secret',
	INVALID_RECORDING_SECRET = 'invalid-recording-secret',
	INVALID_ROOM = 'invalid-room',
	INVALID_RECORDING = 'invalid-recording',
	UNAUTHORIZED_RECORDING_ACCESS = 'unauthorized-recording-access',
	INTERNAL_ERROR = 'internal-error'
}
