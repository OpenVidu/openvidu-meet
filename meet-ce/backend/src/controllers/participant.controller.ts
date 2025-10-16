import {
	AuthTransportMode,
	OpenViduMeetPermissions,
	ParticipantOptions,
	ParticipantRole
} from '@openvidu-meet/typings';
import { Request, Response } from 'express';
import { container } from '../config/index.js';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import {
	errorInvalidParticipantToken,
	errorParticipantTokenNotPresent,
	handleError,
	rejectRequestFromMeetError
} from '../models/error.model.js';
import { LoggerService, ParticipantService, RoomService, TokenService } from '../services/index.js';
import { getAuthTransportMode, getCookieOptions, getParticipantToken } from '../utils/index.js';

export const generateParticipantToken = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const participantService = container.get(ParticipantService);
	const tokenService = container.get(TokenService);

	const participantOptions: ParticipantOptions = req.body;
	const { roomId } = participantOptions;

	// Check if there is a previous token (only for cookie mode)
	const previousToken = req.cookies[INTERNAL_CONFIG.PARTICIPANT_TOKEN_COOKIE_NAME];
	let currentRoles: { role: ParticipantRole; permissions: OpenViduMeetPermissions }[] = [];

	if (previousToken) {
		// If there is a previous token, extract the roles from it
		// and use them to generate the new token, aggregating the new role to the current ones
		// This logic is only used in cookie mode to allow multiple roles across tabs
		logger.verbose('Previous participant token found. Extracting roles');

		try {
			const claims = tokenService.getClaimsIgnoringExpiration(previousToken);
			const metadata = participantService.parseMetadata(claims.metadata || '{}');
			currentRoles = metadata.roles;
		} catch (error) {
			logger.verbose('Error extracting roles from previous token:', error);
		}
	}

	try {
		logger.verbose(`Generating participant token for room '${roomId}'`);
		const token = await participantService.generateOrRefreshParticipantToken(participantOptions, currentRoles);

		const authTransportMode = await getAuthTransportMode();

		// Send participant token as cookie for cookie mode
		if (authTransportMode === AuthTransportMode.COOKIE) {
			res.cookie(INTERNAL_CONFIG.PARTICIPANT_TOKEN_COOKIE_NAME, token, getCookieOptions('/'));
		}

		return res.status(200).json({ token });
	} catch (error) {
		handleError(res, error, `generating participant token for room '${roomId}'`);
	}
};

export const refreshParticipantToken = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const tokenService = container.get(TokenService);
	const participantService = container.get(ParticipantService);

	// Check if there is a previous token
	const previousToken = await getParticipantToken(req);

	if (!previousToken) {
		logger.verbose('No previous participant token found. Cannot refresh.');
		const error = errorParticipantTokenNotPresent();
		return rejectRequestFromMeetError(res, error);
	}

	// Extract roles from the previous token
	let currentRoles: { role: ParticipantRole; permissions: OpenViduMeetPermissions }[] = [];

	try {
		const claims = tokenService.getClaimsIgnoringExpiration(previousToken);
		const metadata = participantService.parseMetadata(claims.metadata || '{}');
		currentRoles = metadata.roles;
	} catch (err) {
		logger.verbose('Error extracting roles from previous token:', err);
		const error = errorInvalidParticipantToken();
		return rejectRequestFromMeetError(res, error);
	}

	const participantOptions: ParticipantOptions = req.body;
	const { roomId } = participantOptions;

	try {
		logger.verbose(`Refreshing participant token for room '${roomId}'`);
		const token = await participantService.generateOrRefreshParticipantToken(
			participantOptions,
			currentRoles,
			true
		);

		const authTransportMode = await getAuthTransportMode();

		// Send participant token as cookie for cookie mode
		if (authTransportMode === AuthTransportMode.COOKIE) {
			res.cookie(INTERNAL_CONFIG.PARTICIPANT_TOKEN_COOKIE_NAME, token, getCookieOptions('/'));
		}

		return res.status(200).json({ token });
	} catch (error) {
		handleError(res, error, `refreshing participant token for room '${roomId}'`);
	}
};

export const updateParticipantRole = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const participantService = container.get(ParticipantService);
	const { roomId, participantIdentity } = req.params;
	const { role } = req.body;

	try {
		logger.verbose(`Changing role of participant '${participantIdentity}' in room '${roomId}' to '${role}'`);
		await participantService.updateParticipantRole(roomId, participantIdentity, role);
		res.status(200).json({ message: `Participant '${participantIdentity}' role updated to '${role}'` });
	} catch (error) {
		handleError(res, error, `changing role for participant '${participantIdentity}' in room '${roomId}'`);
	}
};

export const kickParticipant = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);
	const participantService = container.get(ParticipantService);
	const { roomId, participantIdentity } = req.params;

	// Check if the room exists
	try {
		await roomService.getMeetRoom(roomId);
	} catch (error) {
		return handleError(res, error, `getting room '${roomId}'`);
	}

	try {
		logger.verbose(`Kicking participant '${participantIdentity}' from room '${roomId}'`);
		await participantService.kickParticipant(roomId, participantIdentity);
		res.status(200).json({
			message: `Participant '${participantIdentity}' kicked successfully from room '${roomId}'`
		});
	} catch (error) {
		handleError(res, error, `kicking participant '${participantIdentity}' from room '${roomId}'`);
	}
};
