type StatusError = 400 | 401 | 403 | 404 | 406 | 409 | 422 | 500 | 503;
export class OpenViduMeetError extends Error {
	name: string;
	statusCode: StatusError;
	constructor(error: string, message: string, statusCode: StatusError) {
		super(message);
		this.name = error;
		this.statusCode = statusCode;
	}
}

// General errors

export const errorLivekitIsNotAvailable = (): OpenViduMeetError => {
	return new OpenViduMeetError('LiveKit Error', 'LiveKit is not available', 503);
};

export const errorS3NotAvailable = (error: any): OpenViduMeetError => {
	return new OpenViduMeetError('S3 Error', `S3 is not available ${error}`, 503);
};

export const internalError = (error: any): OpenViduMeetError => {
	return new OpenViduMeetError('Unexpected error', `Something went wrong ${error}`, 500);
};

export const errorRequest = (error: string): OpenViduMeetError => {
	return new OpenViduMeetError('Wrong request', `Problem with some body parameter. ${error}`, 400);
};

export const errorUnprocessableParams = (error: string): OpenViduMeetError => {
	return new OpenViduMeetError('Wrong request', `Some parameters are not valid. ${error}`, 422);
};

// Auth errors

export const errorUnauthorized = (): OpenViduMeetError => {
	return new OpenViduMeetError('Authentication error', 'Unauthorized', 401);
};

export const errorInvalidToken = (): OpenViduMeetError => {
	return new OpenViduMeetError('Authentication error', 'Invalid token', 401);
};

export const errorInvalidTokenSubject = (): OpenViduMeetError => {
	return new OpenViduMeetError('Authentication error', 'Invalid token subject', 403);
};

export const errorInsufficientPermissions = (): OpenViduMeetError => {
	return new OpenViduMeetError('Authentication error', 'You do not have permission to access this resource', 403);
};

export const errorInvalidApiKey = (): OpenViduMeetError => {
	return new OpenViduMeetError('Authentication error', 'Invalid API key', 401);
};

// Recording errors

export const errorRecordingNotFound = (recordingId: string): OpenViduMeetError => {
	return new OpenViduMeetError('Recording Error', `Recording '${recordingId}' not found`, 404);
};

export const errorRecordingNotStopped = (recordingId: string): OpenViduMeetError => {
	return new OpenViduMeetError('Recording Error', `Recording '${recordingId}' is not stopped yet`, 409);
};

export const errorRecordingAlreadyStopped = (recordingId: string): OpenViduMeetError => {
	return new OpenViduMeetError('Recording Error', `Recording '${recordingId}' is already stopped`, 409);
};

export const errorRecordingCannotBeStoppedWhileStarting = (recordingId: string): OpenViduMeetError => {
	return new OpenViduMeetError('Recording Error', `Recording '${recordingId}' cannot be stopped while starting`, 409);
};

export const errorRecordingAlreadyStarted = (roomId: string): OpenViduMeetError => {
	return new OpenViduMeetError('Recording Error', `The room '${roomId}' is already being recorded`, 409);
};

export const errorRecordingStartTimeout = (roomId: string): OpenViduMeetError => {
	return new OpenViduMeetError('Recording Error', `Recording in room '${roomId}' timed out while starting`, 503);
};

export const errorRoomHasNoParticipants = (roomId: string): OpenViduMeetError => {
	return new OpenViduMeetError('Recording Error', `The room '${roomId}' has no participants`, 409);
};

const isMatchingError = (error: OpenViduMeetError, originalError: OpenViduMeetError): boolean => {
	return (
		error instanceof OpenViduMeetError &&
		error.name === originalError.name &&
		error.statusCode === originalError.statusCode &&
		error.message === originalError.message
	);
};

export const isErrorRecordingAlreadyStopped = (error: OpenViduMeetError, recordingId: string): boolean => {
	return isMatchingError(error, errorRecordingAlreadyStopped(recordingId));
};

export const isErrorRecordingNotFound = (error: OpenViduMeetError, recordingId: string): boolean => {
	return isMatchingError(error, errorRecordingNotFound(recordingId));
};

export const isErrorRecordingCannotBeStoppedWhileStarting = (
	error: OpenViduMeetError,
	recordingId: string
): boolean => {
	return isMatchingError(error, errorRecordingCannotBeStoppedWhileStarting(recordingId));
};

// Room errors

export const errorRoomNotFound = (roomId: string): OpenViduMeetError => {
	return new OpenViduMeetError('Room Error', `The room '${roomId}' does not exist`, 404);
};

export const errorInvalidRoomSecret = (roomId: string, secret: string): OpenViduMeetError => {
	return new OpenViduMeetError('Room Error', `The secret '${secret}' is not recognized for room '${roomId}'`, 400);
};

// Participant errors

export const errorParticipantNotFound = (participantName: string, roomId: string): OpenViduMeetError => {
	return new OpenViduMeetError('Participant Error', `'${participantName}' not found in room '${roomId}'`, 404);
};

export const errorParticipantAlreadyExists = (participantName: string, roomId: string): OpenViduMeetError => {
	return new OpenViduMeetError('Room Error', `'${participantName}' already exists in room in ${roomId}`, 409);
};
