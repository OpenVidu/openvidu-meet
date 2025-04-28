import bodyParser from 'body-parser';
import { Router } from 'express';
import * as participantCtrl from '../controllers/participant.controller.js';
import { configureParticipantTokenAuth, validateParticipantTokenRequest } from '../middlewares/index.js';

export const internalParticipantRouter = Router();
internalParticipantRouter.use(bodyParser.urlencoded({ extended: true }));
internalParticipantRouter.use(bodyParser.json());

// Internal Participant Routes
internalParticipantRouter.post(
	'/token',
	validateParticipantTokenRequest,
	configureParticipantTokenAuth,
	participantCtrl.generateParticipantToken
);
internalParticipantRouter.post(
	'/token/refresh',
	validateParticipantTokenRequest,
	configureParticipantTokenAuth,
	participantCtrl.refreshParticipantToken
);
