export const enum ErrorReason {
	MISSING_ROOM_SECRET = 'missing-room-secret',
	MISSING_RECORDING_SECRET = 'missing-recording-secret',
	INVALID_ROOM_SECRET = 'invalid-room-secret',
	INVALID_RECORDING_SECRET = 'invalid-recording-secret',
	INVALID_ROOM = 'invalid-room',
	INVALID_RECORDING = 'invalid-recording',
	NO_RECORDINGS = 'no-recordings',
	UNAUTHORIZED_RECORDING_ACCESS = 'unauthorized-recording-access',
	RECORDINGS_ADMIN_ONLY_ACCESS = 'recordings-admin-only-access',
	INTERNAL_ERROR = 'internal-error'
}
