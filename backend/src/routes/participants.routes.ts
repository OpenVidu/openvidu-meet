import { Router } from 'express';
import bodyParser from 'body-parser';
import * as participantCtrl from '../controllers/participant.controller.js';
import {
	validateParticipantDeletionRequest,
	validateParticipantTokenRequest
} from '../middlewares/request-validators/participant-validator.middleware.js';
import { configureTokenAuth, withModeratorPermissions } from '../middlewares/participant.middleware.js';
import { participantTokenValidator, withAuth } from '../middlewares/auth.middleware.js';

export const internalParticipantsRouter = Router();
internalParticipantsRouter.use(bodyParser.urlencoded({ extended: true }));
internalParticipantsRouter.use(bodyParser.json());

// Internal Participant Routes
internalParticipantsRouter.post(
	'/token',
	validateParticipantTokenRequest,
	configureTokenAuth,
	participantCtrl.generateParticipantToken
);
internalParticipantsRouter.post(
	'/token/refresh',
	validateParticipantTokenRequest,
	configureTokenAuth,
	participantCtrl.refreshParticipantToken
);
internalParticipantsRouter.delete(
	'/:participantName',
	withAuth(participantTokenValidator),
	validateParticipantDeletionRequest,
	withModeratorPermissions,
	participantCtrl.deleteParticipant
);
