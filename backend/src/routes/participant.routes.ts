import { Router } from 'express';
import bodyParser from 'body-parser';
import * as participantCtrl from '../controllers/participant.controller.js';
import { validateParticipantTokenRequest, configureTokenAuth } from '../middlewares/index.js';

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
