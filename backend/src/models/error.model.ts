import { Response } from 'express';
import { container } from '../config/index.js';
import { LoggerService } from '../services/index.js';
import { z } from 'zod';

type StatusError = 400 | 401 | 402 | 403 | 404 | 409 | 415 | 416 | 422 | 500 | 503;
export class OpenViduMeetError extends Error {
	name: string;
	statusCode: StatusError;

	constructor(error: string, message: string, statusCode: StatusError) {
		super(message);
		this.name = error;
		this.statusCode = statusCode;
	}
}

interface ErrorResponse {
	error: string;
	message: string;
	details?: {
		field: string;
		message: string;
	}[];
}

// General errors

export const errorMalformedBody = (): OpenViduMeetError => {
	return new OpenViduMeetError('Bad Request', 'Malformed body', 400);
};

export const errorProFeature = (operation: string): OpenViduMeetError => {
	return new OpenViduMeetError(
		'Pro Feature Error',
		`The operation '${operation}' is a PRO feature. Please, upgrade to OpenVidu PRO`,
		402
	);
};

export const errorUnsupportedMediaType = (supportedTypes: string[]): OpenViduMeetError => {
	return new OpenViduMeetError(
		'Unsupported Media Type',
		`Unsupported media type. Supported types: ${supportedTypes.join(', ')}`,
		415
	);
};

export const internalError = (operationDescription: string): OpenViduMeetError => {
	return new OpenViduMeetError('Internal Server Error', `Unexpected error while ${operationDescription}`, 500);
};

export const errorLivekitNotAvailable = (): OpenViduMeetError => {
	return new OpenViduMeetError('LiveKit Error', 'LiveKit is not available', 503);
};

export const errorS3NotAvailable = (error: any): OpenViduMeetError => {
	return new OpenViduMeetError('S3 Error', `S3 is not available ${error}`, 503);
};

export const errorAzureNotAvailable = (error: any): OpenViduMeetError => {
	return new OpenViduMeetError('ABS Error', `Azure Blob Storage is not available ${error}`, 503);
};

export const errorWebhookUrlUnreachable = (url: string): OpenViduMeetError => {
	return new OpenViduMeetError('Webhook Error', `Webhook URL '${url}' is unreachable`, 400);
};

// Auth errors

export const errorInvalidCredentials = (): OpenViduMeetError => {
	return new OpenViduMeetError('Login Error', 'Invalid username or password', 404);
};

export const errorUnauthorized = (): OpenViduMeetError => {
	return new OpenViduMeetError('Authentication Error', 'Unauthorized', 401);
};

export const errorInvalidToken = (): OpenViduMeetError => {
	return new OpenViduMeetError('Authentication Error', 'Invalid token', 401);
};

export const errorInvalidTokenSubject = (): OpenViduMeetError => {
	return new OpenViduMeetError('Authorization Error', 'Invalid token subject', 403);
};

export const errorRefreshTokenNotPresent = (): OpenViduMeetError => {
	return new OpenViduMeetError('Refresh Token Error', 'No refresh token provided', 400);
};

export const errorInvalidRefreshToken = (): OpenViduMeetError => {
	return new OpenViduMeetError('Refresh Token Error', 'Invalid refresh token', 400);
};

export const errorInsufficientPermissions = (): OpenViduMeetError => {
	return new OpenViduMeetError('Authorization Error', 'Insufficient permissions to access this resource', 403);
};

export const errorInvalidApiKey = (): OpenViduMeetError => {
	return new OpenViduMeetError('Authentication Error', 'Invalid API key', 401);
};

export const errorApiKeyNotConfigured = (): OpenViduMeetError => {
	return new OpenViduMeetError(
		'Authentication Error',
		'There are no API keys configured yet. Please, create one to access the API',
		401
	);
};

// Recording errors

export const errorRecordingDisabled = (roomId: string): OpenViduMeetError => {
	return new OpenViduMeetError('Recording Error', `Recording is disabled for room '${roomId}'`, 403);
};

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
	return new OpenViduMeetError('Recording Error', `Room '${roomId}' is already being recorded`, 409);
};

export const errorRecordingStartTimeout = (roomId: string): OpenViduMeetError => {
	return new OpenViduMeetError('Recording Error', `Recording in room '${roomId}' timed out while starting`, 503);
};

export const errorRecordingRangeNotSatisfiable = (recordingId: string, fileSize: number): OpenViduMeetError => {
	return new OpenViduMeetError(
		'Recording Error',
		`Recording '${recordingId}' range not satisfiable. File size: ${fileSize}`,
		416
	);
};

export const errorRoomHasNoParticipants = (roomId: string): OpenViduMeetError => {
	return new OpenViduMeetError('Recording Error', `Room '${roomId}' has no participants`, 409);
};

export const errorInvalidRecordingSecret = (recordingId: string, secret: string): OpenViduMeetError => {
	return new OpenViduMeetError(
		'Recording Error',
		`Secret '${secret}' is not recognized for recording '${recordingId}'`,
		400
	);
};

export const errorRecordingsNotFromSameRoom = (roomId: string): OpenViduMeetError => {
	return new OpenViduMeetError(
		'Recording Error',
		`None of the provided recording IDs belong to room '${roomId}'`,
		400
	);
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
	return new OpenViduMeetError('Room Error', `Room '${roomId}' does not exist`, 404);
};

export const errorRoomMetadataNotFound = (roomId: string): OpenViduMeetError => {
	return new OpenViduMeetError(
		'Room Error',
		`Room metadata for '${roomId}' not found. Room '${roomId}' does not exist or has no recordings associated`,
		404
	);
};

export const errorInvalidRoomSecret = (roomId: string, secret: string): OpenViduMeetError => {
	return new OpenViduMeetError('Room Error', `Secret '${secret}' is not recognized for room '${roomId}'`, 400);
};

// Participant errors

export const errorParticipantNotFound = (participantName: string, roomId: string): OpenViduMeetError => {
	return new OpenViduMeetError(
		'Participant Error',
		`Participant '${participantName}' not found in room '${roomId}'`,
		404
	);
};

export const errorParticipantAlreadyExists = (participantName: string, roomId: string): OpenViduMeetError => {
	return new OpenViduMeetError(
		'Participant Error',
		`Participant '${participantName}' already exists in room '${roomId}'`,
		409
	);
};

export const errorParticipantTokenStillValid = (): OpenViduMeetError => {
	return new OpenViduMeetError('Participant Error', 'Participant token is still valid', 409);
};

export const errorParticipantTokenNotPresent = (): OpenViduMeetError => {
	return new OpenViduMeetError('Participant', 'No participant token provided', 400);
};

export const errorInvalidParticipantToken = (): OpenViduMeetError => {
	return new OpenViduMeetError('Participant', 'Invalid participant token', 400);
};

export const errorInvalidParticipantRole = (): OpenViduMeetError => {
	return new OpenViduMeetError('Participant', 'No valid participant role provided', 400);
};

// Handlers

export const handleError = (res: Response, error: OpenViduMeetError | unknown, operationDescription: string) => {
	const logger = container.get(LoggerService);
	logger.error(`Error while ${operationDescription}: ${error}`);

	if (!(error instanceof OpenViduMeetError)) {
		error = internalError(operationDescription);
	}

	return rejectRequestFromMeetError(res, error as OpenViduMeetError);
};

export const rejectRequestFromMeetError = (res: Response, error: OpenViduMeetError) => {
	const errorResponse: ErrorResponse = {
		error: error.name,
		message: error.message
	};
	return res.status(error.statusCode).json(errorResponse);
};

export const rejectUnprocessableRequest = (res: Response, error: z.ZodError) => {
	const errorDetails = error.errors.map((error) => ({
		field: error.path.join('.'),
		message: error.message
	}));

	const errorResponse: ErrorResponse = {
		error: 'Unprocessable Entity',
		message: 'Invalid request',
		details: errorDetails
	};
	return res.status(422).json(errorResponse);
};
