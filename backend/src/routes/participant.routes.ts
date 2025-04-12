import { Router } from 'express';
import bodyParser from 'body-parser';
import * as participantCtrl from '../controllers/participant.controller.js';
import {
	validateParticipantDeletionRequest,
	validateParticipantTokenRequest
} from '../middlewares/request-validators/participant-validator.middleware.js';
import { configureTokenAuth, withModeratorPermissions } from '../middlewares/participant.middleware.js';
import { participantTokenValidator, withAuth } from '../middlewares/auth.middleware.js';

export const internalParticipantRouter = Router();
internalParticipantRouter.use(bodyParser.urlencoded({ extended: true }));
internalParticipantRouter.use(bodyParser.json());

// Internal Participant Routes
internalParticipantRouter.post(
	'/token',
	validateParticipantTokenRequest,
	configureTokenAuth,
	participantCtrl.generateParticipantToken
);
internalParticipantRouter.post(
	'/token/refresh',
	validateParticipantTokenRequest,
	configureTokenAuth,
	participantCtrl.refreshParticipantToken
);
internalParticipantRouter.delete(
	'/:participantName',
	withAuth(participantTokenValidator),
	validateParticipantDeletionRequest,
	withModeratorPermissions,
	participantCtrl.deleteParticipant
);
